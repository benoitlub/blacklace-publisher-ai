import test from "node:test";
import assert from "node:assert/strict";
import { executeBufferBookPost, GERARD_BOOK_CHANNEL_ID, type BufferReservation } from "../buffer-book-post.ts";
import { chooseSocialTransport, inspectSocialCapabilities } from "../social-transport.ts";

const input = { harvestId: "book", text: "Texte choisi par Gérard", mediaUrl: "https://example.org/cover.jpg", channelId: GERARD_BOOK_CHANNEL_ID, publish: true, dryRun: false };
function fixture(options: { fail?: string; paused?: boolean; badPost?: string } = {}) {
  let row: BufferReservation | null = null;
  let post: any = null;
  const writes: string[] = [];
  const reads: string[] = [];
  const deps = {
    request: async (query: string) => {
      if (query.includes("query { channel(")) return { data: { channel: { id: input.channelId, service: "instagram", isLocked: false, isDisconnected: false, isQueuePaused: options.paused ?? false } } };
      if (query.includes("query { post(")) {
        reads.push(post?.id);
        if (options.fail === "read") throw new Error("outage");
        return { data: { post: options.badPost === "copy" ? { ...post, text: "Changed" } : options.badPost === "date" ? { ...post, dueAt: null } : post } };
      }
      assert.ok(row, "durable claim before any mutation");
      if (query.includes("createPost")) {
        writes.push("create");
        assert.match(query, /saveToDraft: true/);
        if (options.fail === "invalid") return { data: { createPost: { __typename: "InvalidInputError" } } };
        post = { id: "buffer-simulated-42", channelId: input.channelId, status: "draft", text: input.text, assets: [{ mimeType: "image/jpeg" }] };
        if (options.fail === "create") throw new Error("write may have succeeded");
        return { data: { createPost: { __typename: "PostActionSuccess", post: { id: post.id } } } };
      }
      writes.push("edit");
      assert.match(query, /editPost/); assert.doesNotMatch(query, /createPost/);
      assert.ok(query.includes(JSON.stringify(input.text))); assert.ok(query.includes(JSON.stringify(input.mediaUrl)));
      post = { ...post, status: "scheduled", dueAt: new Date(Date.now() + 86400000).toISOString() };
      if (options.fail === "edit") throw new Error("lost response");
      return { data: { editPost: { __typename: "PostActionSuccess", post: { id: post.id } } } };
    },
    load: async () => row ? [{ ...row }] : [],
    claim: async () => row ? null : (row = { fingerprint: "fp", status: "pending", post_id: null }),
    transition: async (expected: BufferReservation, status: string, id: string | null) => {
      if (!row || row.status !== expected.status || row.post_id !== expected.post_id) return false;
      row = { ...row, status, post_id: id }; return true;
    },
    verifyMedia: async () => { if (options.fail === "media") throw new Error("not an image"); },
  };
  return { deps, writes, reads, row: () => row, post: () => post };
}

test("Buffer: verified draft -> same-ID queue -> fresh status -> repeat without writes", async () => {
  const f = fixture();
  const draft = await executeBufferBookPost({ ...input, publish: false }, f.deps);
  assert.equal(draft.status, "draft-created"); assert.equal(draft.draftCreated, true); assert.equal(draft.scheduled, false);
  const queued = await executeBufferBookPost(input, f.deps);
  assert.equal(queued.status, "confirmed-scheduled"); assert.equal(queued.postId, draft.postId);
  const status = await executeBufferBookPost({ ...input, dryRun: true }, f.deps);
  assert.equal(status.postId, draft.postId); assert.equal(status.scheduled, true);
  await executeBufferBookPost(input, f.deps);
  assert.deepEqual(f.writes, ["create", "edit"]); assert.ok(f.reads.length >= 4);
});
test("Buffer previews verify dependencies without claiming or mutating", async () => {
  const f = fixture(); const out = await executeBufferBookPost({ ...input, dryRun: true }, f.deps);
  assert.equal(out.status, "ready-to-schedule"); assert.equal(out.scheduled, false); assert.equal(f.row(), null); assert.deepEqual(f.writes, []);
});
test("Buffer: lost create response never recreates an unidentified draft", async () => {
  const f = fixture({ fail: "create" });
  for (let i = 0; i < 2; i++) assert.equal((await executeBufferBookPost(input, f.deps)).scheduled, false);
  assert.deepEqual(f.writes, ["create"]); assert.equal(f.row()?.status, "pending");
});
test("Buffer: lost queue response reconciles by ID without another edit", async () => {
  const f = fixture({ fail: "edit" });
  assert.equal((await executeBufferBookPost(input, f.deps)).scheduled, false);
  assert.equal((await executeBufferBookPost(input, f.deps)).scheduled, true);
  assert.equal(f.row()?.status, "queued");
  assert.deepEqual(f.writes, ["create", "edit"]);
});
test("Buffer: ID alone, changed copy or missing schedule never confirm a publication", async () => {
  for (const options of [{ fail: "read" }, { badPost: "copy" }, { badPost: "date" }]) {
    const f = fixture(options);
    const out = await executeBufferBookPost(input, f.deps);
    assert.equal(out.scheduled, false); assert.equal(out.status, "confirmation-required");
    await executeBufferBookPost(input, f.deps);
    assert.equal(f.writes.filter(w => w === "create").length, 1);
    assert.ok(f.writes.filter(w => w === "edit").length <= 1);
  }
});
test("Buffer unavailable channel or media causes zero mutations", async () => {
  for (const options of [{ paused: true }, { fail: "media" }]) {
    const f = fixture(options); assert.equal((await executeBufferBookPost(input, f.deps)).scheduled, false); assert.deepEqual(f.writes, []);
  }
});
test("Buffer typed validation rejection is recorded and never claimed as a draft", async () => {
  const f = fixture({ fail: "invalid" });
  const out = await executeBufferBookPost(input, f.deps);
  assert.equal(out.status, "validation-rejected"); assert.equal(out.draftCreated, false); assert.equal(f.row()?.status, "validation-rejected");
});
test("Buffer concurrent calls claim only one create and one queue mutation", async () => {
  const f = fixture(); const outcomes = await Promise.all([executeBufferBookPost(input, f.deps), executeBufferBookPost(input, f.deps)]);
  assert.equal(f.writes.filter(w => w === "create").length, 1); assert.equal(f.writes.filter(w => w === "edit").length, 1);
  assert.ok(outcomes.some(o => o.scheduled));
});
test("explicit Metricool request never silently falls back to Buffer", () => {
  assert.deepEqual(chooseSocialTransport({ requested: "metricool", metricoolAvailable: false, bufferConnected: true, allowBufferProduction: true }), { transport: "metricool", mode: "hold", reason: "requested-metricool-unavailable" });
  assert.equal(chooseSocialTransport({ requested: "buffer", metricoolAvailable: true, bufferConnected: true, allowBufferProduction: true }).transport, "buffer");
});

test("social capability inventory never swaps the requested account", () => {
  const observation = { provider: "buffer" as const, account: "benoitlubert", network: "instagram",
    connected: true, canSchedule: true, supportedMedia: ["image"] as const,
    verifiedAt: "2026-10-23T15:00:00Z", source: "provider-read" };
  assert.deepEqual(inspectSocialCapabilities({
    targetAccount: "pro.hbtd", network: "instagram", media: "image", observations: [observation],
  }), { status: "no-verified-transport", candidates: [] });
});

test("unverified capability or missing media permission always blocks", () => {
  const base = { provider: "metricool" as const, account: "pro.hbtd", network: "instagram",
    connected: true, canSchedule: true, supportedMedia: ["image"] as const,
    verifiedAt: null, source: null };
  const unknown = inspectSocialCapabilities({
    targetAccount: "pro.hbtd", network: "instagram", media: "image", observations: [base],
  });
  assert.equal(unknown.status, "no-verified-transport");
  assert.equal(unknown.candidates[0]?.reason, "capability-not-verified");
  const missingMedia = inspectSocialCapabilities({
    targetAccount: "pro.hbtd", network: "instagram", media: "video",
    observations: [{ ...base, verifiedAt: "2026-10-23T15:00:00Z", source: "provider-read" }],
  });
  assert.equal(missingMedia.candidates[0]?.reason, "media-not-supported");
});

test("verified matching transport is only marked available in read-only inventory", () => {
  const result = inspectSocialCapabilities({
    targetAccount: "@benoitlubert", network: "instagram", media: "image",
    observations: [{ provider: "buffer", account: "benoitlubert", network: "instagram",
      connected: true, canSchedule: true, supportedMedia: ["image"],
      verifiedAt: "2026-10-23T15:00:00Z", source: "provider-read" }],
  });
  assert.equal(result.status, "available");
  assert.equal(result.candidates[0]?.reason, "verified-scheduling-capability");
});
