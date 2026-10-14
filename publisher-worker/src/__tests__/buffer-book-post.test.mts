import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBufferBookPostMutation, buildGerardExistingDraftQueueMutation, inspectGerardExistingDraft, GERARD_BUFFER_POST_ID, GERARD_BOOK_CHANNEL_ID, GERARD_BOOK_INSTAGRAM_CAPTION } from "../buffer-book-post";

const base = {
  text: "Deux Gérard. Un seul livre. Découvrir : https://www.amazon.fr/dp/B0H68811RL",
  channelId: "verified-instagram-channel-id",
  mediaUrl: "https://example.org/official-cover.jpg",
};

test("Instagram book post declares Buffer-required channel post type", () => {
  const mutation = buildBufferBookPostMutation({ ...base, publish: false });
  assert.match(mutation, /metadata: \{ instagram: \{ type: post, shouldShareToFeed: true \} \}/);
  assert.match(mutation, /assets: \[\{ image: \{ url: "https:\/\/example.org\/official-cover.jpg" \} \}\]/);
  assert.match(mutation, /saveToDraft: true/);
  assert.match(mutation, /on PostActionSuccess \{ post \{ id \} \}/);
  assert.match(mutation, /on InvalidInputError \{ message \}/);
});

test("existing queue flag is preserved, never inferred from the document text", () => {
  const safe = buildBufferBookPostMutation({ ...base, publish: false });
  const queued = buildBufferBookPostMutation({ ...base, publish: true });
  assert.match(safe, /saveToDraft: true/);
  assert.match(queued, /saveToDraft: false/);
  assert.match(safe, /mode: addToQueue/);
});

test("quote-like copy remains escaped and cannot modify the GraphQL fields", () => {
  const mutation = buildBufferBookPostMutation({
    ...base,
    text: 'A book "with quotes" and a newline\nRead now',
    publish: false,
  });
  assert.ok(mutation.includes(JSON.stringify('A book "with quotes" and a newline\nRead now')));
  assert.match(mutation, /metadata: \{ instagram: \{ type: post, shouldShareToFeed: true \} \}/);
});

test("existing Buffer draft is checked for exact post identity, Instagram channel and image", () => {
  const good = {
    id: GERARD_BUFFER_POST_ID,
    channelId: GERARD_BOOK_CHANNEL_ID,
    status: "draft",
    text: "Deux Gérard. Un seul livre. https://www.amazon.fr/dp/B0H68811RL",
    assets: [{ id: "asset-1", mimeType: "image/jpeg" }],
  };
  assert.equal(inspectGerardExistingDraft(good).eligible, true);
  assert.equal(inspectGerardExistingDraft({ ...good, status: "scheduled" }).eligible, false);
  assert.equal(inspectGerardExistingDraft({ ...good, channelId: "wrong" }).eligible, false);
  assert.equal(inspectGerardExistingDraft({ ...good, assets: [] }).eligible, false);
  assert.equal(inspectGerardExistingDraft({ ...good, text: "another book" }).eligible, false);
});

test("a verified draft is edited in place, never recreated", () => {
  const mutation = buildGerardExistingDraftQueueMutation(GERARD_BUFFER_POST_ID);
  assert.ok(mutation.includes("editPost(input:"));
  assert.doesNotMatch(mutation, /createPost/);
  assert.match(mutation, /saveToDraft: false/);
  assert.match(mutation, /mode: addToQueue/);
  assert.ok(mutation.includes("metadata: { instagram: { type: post, shouldShareToFeed: true"));
  assert.ok(mutation.includes("assets: [{ image: { url: "));
  assert.ok(mutation.includes("Gerard_et_Gerard_couverture_retouchee.jpg"));
  assert.equal((mutation.match(/assets:/g) || []).length, 1);
  assert.match(mutation, /on PostActionSuccess/);
  assert.ok(mutation.includes(JSON.stringify(GERARD_BOOK_INSTAGRAM_CAPTION)));
  assert.ok(GERARD_BOOK_INSTAGRAM_CAPTION.includes("B0H68811RL"));
  assert.ok(!GERARD_BOOK_INSTAGRAM_CAPTION.includes("[Lien en bio]"));
  assert.ok(!GERARD_BOOK_INSTAGRAM_CAPTION.includes("[Plan serré"));
});

test("cannot promote a different Buffer post ID", () => {
  assert.throws(() => buildGerardExistingDraftQueueMutation("another-id"));
});
