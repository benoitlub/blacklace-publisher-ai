import test from "node:test";
import assert from "node:assert/strict";
import { generateMistralImage, downloadMistralImage } from "../../../artifacts/api-server/src/services/mistral-image.ts";
import module from "../worker.ts";
const app = "fetch" in module ? module : module.default;
const generated = { conversation_id: "conv-fixture", outputs: [
  { type: "message.output", role: "assistant", content: [
    { type: "tool_file", tool: "image_generation", file_id: "image-fixture", file_type: "png" },
  ] },
] };
test("uses the documented image agent and its actual conversation ID", async () => {
  const calls: string[] = [];
  const result = await generateMistralImage("test-key", "Parcel image", async (url, init) => {
    calls.push(String(url));
    const body = JSON.parse(String(init?.body));
    if (String(url).endsWith("/agents")) {
      assert.equal(body.tools[0].type, "image_generation");
      assert.equal(body.model, "mistral-medium-latest");
      return Response.json({ id: "agent-fixture" });
    }
    assert.deepEqual(body, { agent_id: "agent-fixture", inputs: "Parcel image" });
    return Response.json(generated);
  });
  assert.deepEqual(calls, ["https://api.mistral.ai/v1/agents", "https://api.mistral.ai/v1/conversations"]);
  assert.equal(result.fileId, "image-fixture");
  assert.equal(result.conversationId, "conv-fixture");
});
test("a 429 survives the Worker route with Retry-After and no provider body/secret", async (t) => {
  let count = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).endsWith("/agents")) return Response.json({ id: "agent-fixture" });
    count++;
    return Response.json({ message: "SECRET-MUST-NOT-LEAK" }, { status: 429, headers: { "Retry-After": "120" } });
  });
  const r = await app.fetch(new Request("https://publisher.test/api/production/mistral-image/test?prompt=Own+parcel"), { MISTRAL_API_KEY: "test-key" });
  assert.equal(r.status, 429);
  assert.equal(r.headers.get("retry-after"), "120");
  const p = await r.json() as any;
  assert.equal(p.httpStatus, 429);
  assert.equal(p.retryAllowed, true);
  assert.equal(p.provider.stage, "conversation");
  assert.equal(count, 1);
  assert.ok(!JSON.stringify(p).includes("SECRET-MUST-NOT-LEAK"));
});
test("no generated image is inferred from an input file, another tool or text", async () => {
  for (const payload of [
    { file_id: "input" },
    { ...generated, outputs: [{ type: "message.output", role: "assistant", content: [{ type: "tool_file", tool: "code_interpreter", file_id: "csv" }] }] },
    { ...generated, outputs: [{ type: "message.output", role: "assistant", content: "file_id: fictional" }] },
  ]) await assert.rejects(generateMistralImage("test-key", "Parcel", async (url) => Response.json(String(url).endsWith("/agents") ? { id: "agent-fixture" } : payload)),
    (e: any) => e.code === "MISTRAL_IMAGE_FILE_MISSING" && e.providerOutcomeMayBeUnknown && !e.toJSON().retryAllowed);
});
test("authentication, permissions, billing and download throttling stay distinct", async () => {
  for (const [status, code] of [[401, "MISTRAL_IMAGE_AUTHENTICATION_FAILED"], [402, "MISTRAL_IMAGE_BILLING_REQUIRED"], [403, "MISTRAL_IMAGE_ACCESS_DENIED"], [429, "MISTRAL_IMAGE_RATE_LIMITED"]] as const) {
    await assert.rejects(downloadMistralImage("test-key", "image", async () => new Response("", { status, headers: { "retry-after": "Sun, 08 Nov 2026 12:00:00 GMT" } })),
      (e: any) => e.code === code && e.httpStatus === status && e.stage === "download");
  }
});
test("rejects HTML downloads and never retries an uncertain generation", async () => {
  await assert.rejects(downloadMistralImage("test-key", "image", async () => new Response("<html/>", { headers: { "content-type": "text/html" } })), /CONTENT_TYPE_INVALID/);
  let calls=0;
  await assert.rejects(generateMistralImage("test-key", "Parcel", async (url) => { if (String(url).endsWith("/agents")) return Response.json({ id: "agent-fixture" }); calls++; throw new Error("private network diagnostics"); }),
    (e: any) => e.code === "MISTRAL_IMAGE_NETWORK_FAILED" && !e.toJSON().retryAllowed);
  assert.equal(calls, 1);
});

test("legacy media request does not retry Mistral or switch provider after 429 or an uncertain result", async (t) => {
  for (const limited of [true, false]) await t.test(limited ? "429" : "missing file", async st => {
    let providerCalls = 0;
    const harvest: Record<string, unknown> = { id: "image-test-harvest", seed_id: "test-universe",
      parcel_id: "creative", title: "Campagne test", content: "Accroche centrale: Découvrez notre création.",
      url: null, download_url: null, type: "social", status: "ready",
      created_at: "2026-11-08", synced_at: "2026-11-08" };
    st.mock.method(globalThis, "fetch", async (url, init) => {
      if (String(url) === "https://api.invalid/sql") {
        const { query } = JSON.parse(String(init?.body));
        const rows = /SELECT/i.test(query) ? [harvest] : [];
        const columns = rows.length ? Object.keys(harvest) : [];
        return Response.json({ fields: columns.map(name => ({ name, dataTypeID: 25 })),
          rows: rows.map(row => columns.map(k => row[k])), rowCount: rows.length });
      }
      if (String(url).endsWith("/agents")) return Response.json({ id: "agent-fixture" });
      assert.equal(String(url), "https://api.mistral.ai/v1/conversations");
      providerCalls++;
      return limited ? new Response("", { status: 429, headers: { "retry-after": "120" } })
        : Response.json({ conversation_id: "no-file", outputs: [] });
    });
    const r = await app.fetch(new Request("https://publisher.test/api/social/media/request", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ harvestId: harvest.id }),
    }), { DATABASE_URL: "postgresql://audit:audit@audit.invalid/audit", MISTRAL_API_KEY: "test-key" });
    const p = await r.json() as any;
    assert.equal(r.status, limited ? 429 : 502, JSON.stringify(p));
    assert.equal(p.code, limited ? "MISTRAL_IMAGE_RATE_LIMITED" : "MISTRAL_IMAGE_FILE_MISSING");
    assert.equal(providerCalls, 1);
  });
});

test("Mistral octet-stream images retain a usable MIME without relabelling arbitrary data", async () => {
  const bytes = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0,1,2,3]);
  const r = await downloadMistralImage("test-key", "image", async () => new Response(bytes, { headers: { "content-type": "application/octet-stream" } }));
  assert.equal(r.headers.get("content-type"), "image/png");
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), bytes);
  await assert.rejects(downloadMistralImage("test-key", "not-image", async () => new Response("<html>not an image</html>", { headers: { "content-type": "application/octet-stream" } })), /CONTENT_TYPE_INVALID/);
});
