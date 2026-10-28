import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import workerModule from "../publisher-worker/src/worker.ts";

test("Gerard -> existing Octopus -> Publisher -> Buffer draft -> queue -> read status (all external calls simulated)", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-22T12:00:00Z") });
  const worker = "fetch" in workerModule ? workerModule : workerModule.default;
  const { candidate, mission } = JSON.parse(await readFile(new URL("../publisher-worker/src/__tests__/fixtures/gerard-buffer-mission.json", import.meta.url), "utf8"));
  const { app: octopus } = await import(new URL("../artifacts/api-server/node_modules/octopus-engine/dist/app.js", import.meta.url).href);
  const env = { DATABASE_URL: "postgresql://simulation:simulation@simulation.invalid/simulation", BUFFER_API_KEY: "simulated-buffer-key", BUFFER_DRAFT_WRITE_TOKEN: "simulated-buffer-token", BUFFER_PUBLISHING_ENABLED: "true" };
  const previous = { DATABASE_URL: process.env.DATABASE_URL, PUBLISHER_URL: process.env.PUBLISHER_URL, BUFFER_DRAFT_WRITE_TOKEN: process.env.BUFFER_DRAFT_WRITE_TOKEN };
  process.env.DATABASE_URL = env.DATABASE_URL; process.env.PUBLISHER_URL = "https://publisher.test"; process.env.BUFFER_DRAFT_WRITE_TOKEN = env.BUFFER_DRAFT_WRITE_TOKEN;
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  let adapter: any, row: any = null, post: any = null;
  const trace: string[] = [];
  const writes: string[] = [];
  const harvest = { id: candidate.harvestId, seed_id: candidate.seedId, parcel_id: "books", title: "Livre Gérard & Gérard", content: `Accroche centrale: ${candidate.copy.text}`, url: candidate.media.url, type: "social", status: "ready", created_at: "2026-10-22T12:00:00Z", synced_at: "2026-10-22T12:00:00Z" };
  const sqlResponse = (rows: any[]) => { const cols = rows.length ? Object.keys(rows[0]) : []; return Response.json({ fields: cols.map(name => ({ name, dataTypeID: 25 })), rows: rows.map(r => cols.map(c => r[c])), rowCount: rows.length }); };
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const url = new URL(req.url);
    if (url.origin === "https://octopus.test") { trace.push(`octopus:${url.pathname}`); return octopus.fetch(req); }
    if (url.origin === "https://adapter.test") { trace.push("publisher-local:adapter"); return Response.json(await adapter.executePublisherAdapter(await req.json())); }
    if (url.origin === "https://publisher.test") {
      assert.equal(req.headers.get("Authorization"), "Bearer simulated-buffer-token"); trace.push(`worker:${url.pathname}`); return worker.fetch(req, env);
    }
    if (url.href === "https://api.invalid/sql") {
      const { query, params } = await req.json() as any;
      if (/CREATE (TABLE|INDEX)|ALTER TABLE buffer_draft_reservations ADD COLUMN/.test(query)) return sqlResponse([]);
      if (/UPDATE buffer_draft_reservations\s+SET status='retry-authorized'/.test(query)) return sqlResponse([]);
      if (/SELECT \* FROM garden_harvests/.test(query)) return sqlResponse([harvest]);
      if (/SELECT fingerprint,status,post_id FROM buffer_draft_reservations/.test(query)) return sqlResponse(row ? [{ ...row }] : []);
      if (/INSERT INTO buffer_draft_reservations/.test(query)) {
        if (row) return sqlResponse([]); row = { fingerprint: params[0], status: "pending", post_id: null }; return sqlResponse([{ fingerprint: row.fingerprint }]);
      }
      if (/UPDATE buffer_draft_reservations SET status/.test(query)) {
        assert.equal(params[2], row.fingerprint); if (row.status !== params[3] || row.post_id !== params[4]) return sqlResponse([]);
        row = { ...row, status: params[0], post_id: params[1] }; return sqlResponse([{ fingerprint: row.fingerprint }]);
      }
      throw new Error(`Unplanned SQL in Buffer simulation: ${query}`);
    }
    if (url.href === candidate.media.url) { assert.equal(req.method, "HEAD"); trace.push("media:HEAD"); return new Response(null, { headers: { "Content-Type": "image/jpeg" } }); }
    if (url.origin === "https://api.buffer.com") {
      assert.equal(req.headers.get("Authorization"), "Bearer simulated-buffer-key"); const { query } = await req.json() as any;
      if (query.includes("query { channel(")) return Response.json({ data: { channel: { id: candidate.transport.channelId, service: "instagram", isDisconnected: false, isLocked: false, isQueuePaused: false } } });
      if (query.includes("query { post(")) { trace.push(`buffer:read:${post?.status}`); return Response.json({ data: { post } }); }
      assert.ok(row, "reservation must exist before external write");
      assert.ok(query.includes(JSON.stringify(candidate.copy.text))); assert.ok(query.includes(JSON.stringify(candidate.media.url)));
      if (query.includes("createPost")) {
        assert.match(query, /saveToDraft: true/); writes.push("create-draft"); trace.push("buffer:create-draft");
        post = { id: "buffer-simulated-42", channelId: candidate.transport.channelId, text: candidate.copy.text, status: "draft", assets: [{ id: "simulated-asset", mimeType: "image/jpeg" }] };
        return Response.json({ data: { createPost: { __typename: "PostActionSuccess", post: { id: post.id } } } });
      }
      assert.match(query, /editPost/); assert.match(query, /saveToDraft: false/); assert.ok(query.includes(JSON.stringify(post.id)));
      writes.push("queue-existing"); trace.push("buffer:queue-existing"); post = { ...post, status: "scheduled", dueAt: "2026-10-23T12:00:00Z" };
      return Response.json({ data: { editPost: { __typename: "PostActionSuccess", post: { id: post.id } } } });
    }
    throw new Error(`Real/unplanned network forbidden: ${url.origin}${url.pathname}`);
  });
  adapter = await import("../artifacts/api-server/src/publisher/octopus-adapter.ts");
  await octopus.request("/adapters/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "publisher", name: "Publisher", capabilities: ["social.publish"], executeUrl: "https://adapter.test/execute" }) });
  let missionId;
  if (process.env.GERARD_CLIENT_PATH) {
    const gerard = await import(pathToFileURL(process.env.GERARD_CLIENT_PATH).href);
    assert.deepEqual(gerard.bufferMission(candidate, { execute: true, now: new Date() }), mission);
    const result = await gerard.submitBufferPublication(candidate, { execute: true, octopusUrl: "https://octopus.test" });
    assert.equal(result.bufferHandoff.status, "confirmed-scheduled", JSON.stringify(result)); missionId = result.bufferHandoff.missionId;
    await gerard.submitBufferPublication(candidate, { execute: true, octopusUrl: "https://octopus.test", now: new Date(Date.now() + 1) });
  } else {
    const result = await (await fetch("https://octopus.test/mission", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mission) })).json() as any;
    assert.equal(result.output.status, "confirmed-scheduled", JSON.stringify(result)); missionId = result.missionId;
    await fetch("https://octopus.test/mission", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...mission, operationId: mission.operationId + "-status" }) });
  }
  assert.deepEqual(writes, ["create-draft", "queue-existing"]); assert.equal(row.status, "queued");
  assert.equal(post.text, candidate.copy.text); assert.equal(post.channelId, candidate.transport.channelId);
  const status = await (await octopus.request(`/missions/${missionId}`)).json() as any;
  assert.equal(status.status, "completed"); assert.ok(trace.includes("buffer:read:draft")); assert.ok(trace.includes("buffer:read:scheduled"));
  console.log(JSON.stringify({ proof: "gerard-octopus-publisher-buffer", gerardClient: process.env.GERARD_CLIENT_PATH ? "actual-poulpe-client" : "versioned-mission-fixture", octopus: "existing-pinned-engine", realExternalWrites: 0, simulatedWrites: writes, postId: post.id, dueAt: post.dueAt, repeatedRequestWrites: 0, trace }));
});
