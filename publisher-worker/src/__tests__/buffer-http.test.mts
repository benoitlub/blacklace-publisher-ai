import test from "node:test";
import assert from "node:assert/strict";
import workerModule from "../worker.ts";
const worker = "fetch" in workerModule ? workerModule : workerModule.default;

test("Buffer finalizer requires its own credential, never Metricool's bearer", async t => {
  const guard = t.mock.method(globalThis, "fetch", async () => { throw new Error("No dependencies permitted"); });
  const response = await worker.fetch(new Request("https://publisher.test/api/social/publication/finalize", { method: "POST", headers: { Authorization: "Bearer metricool-only", "Content-Type": "application/json" }, body: JSON.stringify({ transport: "buffer", dryRun: false }) }), { METRICOOL_EXECUTION_TOKEN: "metricool-only", BUFFER_DRAFT_WRITE_TOKEN: "buffer-only" });
  assert.equal((await response.json()).reason, "BUFFER_UNAUTHORIZED"); assert.equal(guard.mock.callCount(), 0);
});
test("Buffer lookup inspects later pages and reports looped pagination as incomplete", async t => {
  for (const loop of [false, true]) {
    let reads = 0;
    const mock = t.mock.method(globalThis, "fetch", async (url, init) => {
      assert.equal(url, "https://api.buffer.com"); const { query } = JSON.parse(String(init?.body));
      if (query.includes("channel(input")) return Response.json({ data: { channel: { id: "channel", organizationId: "org", service: "instagram" } } });
      reads++;
      if (reads > 1) assert.match(query, /after:"next"/);
      return Response.json({ data: { posts: { edges: [{ node: { id: `post-${reads}`, text: "TERRA", status: "draft" } }], pageInfo: { hasNextPage: loop || reads === 1, endCursor: "next" } } } });
    });
    const response = await worker.fetch(new Request("https://publisher.test/api/social/transports/buffer/book-draft/buffer-lookup", { headers: { Authorization: "Bearer simulation" } }), { BUFFER_DRAFT_WRITE_TOKEN: "simulation", BUFFER_API_KEY: "simulation-key" });
    const body = await response.json();
    assert.equal(reads, 2); assert.equal(body.postsInspected, 2); assert.equal(body.terraMatches.length, 2);
    assert.equal(body.status, loop ? "posts-query-incomplete" : "ok"); mock.mock.restore();
  }
});
test("Buffer organizations beyond diagnostic bound are partial, not fully connected", async t => {
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    const { query } = JSON.parse(String(init?.body));
    return Response.json({ data: query.includes("account {") ? { account: { organizations: Array.from({ length: 11 }, (_, i) => ({ id: String(i) })) } } : { channels: [] } });
  });
  const body = await (await worker.fetch(new Request("https://publisher.test/api/social/transports/buffer/channels"), { BUFFER_API_KEY: "simulation-key" })).json();
  assert.equal(body.status, "partial"); assert.equal(body.organizationCount, 11);
});

test("historical Buffer status requires a date; read-only reconciliation does not update reservations", async t => {
  const { GERARD_BUFFER_HARVEST_ID, GERARD_BUFFER_POST_ID, GERARD_BOOK_CHANNEL_ID, GERARD_BOOK_INSTAGRAM_CAPTION } = await import("../buffer-book-post.ts");
  for (const dated of [false, true]) {
    let mutations = 0;
    const mocked = t.mock.method(globalThis, "fetch", async (input, init) => {
      const req = input instanceof Request ? input : new Request(input, init);
      if (req.url === "https://api.invalid/sql") {
        const { query } = await req.json() as any;
        if (/UPDATE|INSERT/.test(query)) mutations++;
        const row = { fingerprint: "historical", status: "promotion-unknown", post_id: GERARD_BUFFER_POST_ID };
        return Response.json({ fields: Object.keys(row).map(name => ({ name, dataTypeID: 25 })), rows: [Object.values(row)], rowCount: 1 });
      }
      assert.equal(req.url, "https://api.buffer.com/");
      const { query } = await req.json() as any;
      if (query.includes("mutation")) mutations++;
      return Response.json({ data: { post: { id: GERARD_BUFFER_POST_ID, channelId: GERARD_BOOK_CHANNEL_ID, text: GERARD_BOOK_INSTAGRAM_CAPTION,
        status: "scheduled", dueAt: dated ? new Date(Date.now() + 86400000).toISOString() : null, assets: [{ mimeType: "image/jpeg" }] },
        channel: { id: GERARD_BOOK_CHANNEL_ID, service: "instagram", isDisconnected: false, isLocked: false, isQueuePaused: false } } });
    });
    const response = await worker.fetch(new Request("https://publisher.test/api/social/transports/buffer/book-draft/queue-existing-gerard", {
      method: "POST", headers: { Authorization: "Bearer simulation", "Content-Type": "application/json" },
      body: JSON.stringify({ harvestId: GERARD_BUFFER_HARVEST_ID, postId: GERARD_BUFFER_POST_ID, dryRun: true }),
    }), { DATABASE_URL: "postgresql://simulation:simulation@simulation.invalid/simulation", BUFFER_DRAFT_WRITE_TOKEN: "simulation", BUFFER_API_KEY: "simulation-key" });
    const result = await response.json(); assert.equal(result.scheduled, dated, JSON.stringify(result)); assert.equal(mutations, 0);
    mocked.mock.restore();
  }
});
