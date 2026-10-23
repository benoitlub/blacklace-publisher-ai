import { officialMediaBySeed } from "./official-media";

/**
 * GraphQL request for the verified Instagram book channel in Buffer.
 * A static image is an Instagram "post", not a reel or story.
 * Keep the channel identity / official artwork / idempotency gates in worker.ts.
 */
export function buildBufferBookPostMutation(input: {
  text: string;
  channelId: string;
  mediaUrl: string;
  publish: boolean;
}): string {
  const { text, channelId, mediaUrl, publish } = input;
  return "mutation { createPost(input: { text: " + JSON.stringify(text) +
    ", channelId: " + JSON.stringify(channelId) +
    ", schedulingType: automatic, mode: addToQueue, saveToDraft: " + (publish ? "false" : "true") +
    ", metadata: { instagram: { type: post, shouldShareToFeed: true } }" +
    ", assets: [{ image: { url: " + JSON.stringify(mediaUrl) + " } }]" +
    " }) { __typename ... on PostActionSuccess { post { id } } ... on InvalidInputError { message } } }";
}

/**
 * One known verified book, one existing Buffer draft. The caption is grounded
 * in the author's verified product knowledge; the Amazon URL is catalog-mapped.
 * Do not claim a link is in Instagram bio if we cannot verify it.
 */
export const GERARD_BUFFER_HARVEST_ID = "neon_iter_iter_gerard-et-gerard_1786288530352";
export const GERARD_BUFFER_POST_ID = "6acfd4de0b61877d1315e86b";
export const GERARD_BOOK_CHANNEL_ID = "6ac8c8226a5c39ccb65fdbf6";
export const GERARD_BOOK_ASIN = "B0H68811RL";
export const GERARD_BOOK_INSTAGRAM_CAPTION =
  "Deux Gérard. Une simulation oubliée. Et l'humanité observée de travers. 🐙✨\n\n" +
  "Croissants, voitures, animaux, technologie… Deux vieux Poulstroïdes essaient de comprendre nos habitudes. " +
  "Leurs conclusions sont parfois absurdes, souvent drôles, et étonnamment tendres.\n\n" +
  "📖 Gérard & Gérard — Brèves histoires d'une simulation oubliée\n" +
  "Disponible sur Amazon : https://www.amazon.fr/dp/B0H68811RL\n\n" +
  "#GerardEtGerard #ScienceFiction #Lecture #Humour";

export type BufferExistingPost = {
  id?: unknown; channelId?: unknown; status?: unknown;
  text?: unknown; dueAt?: unknown; assets?: unknown;
};

export function inspectGerardExistingDraft(post: BufferExistingPost | null) {
  if (!post || post.id !== GERARD_BUFFER_POST_ID || post.channelId !== GERARD_BOOK_CHANNEL_ID)
    return { status: "unverified-post-id-or-channel", eligible: false };
  const status = String(post.status ?? "").toLowerCase();
  if (status !== "draft") return { status: "not-a-draft", eligible: false, currentStatus: status };
  const originalCopy = String(post.text ?? "");
  if (!originalCopy.includes(GERARD_BOOK_ASIN) || !/g[ée]rard/i.test(originalCopy))
    return { status: "unexpected-draft-copy", eligible: false };
  const imageCount = Array.isArray(post.assets)
    ? post.assets.filter(asset => {
      const v = asset && typeof asset === "object" ? asset as Record<string,unknown> : {};
      return typeof v.mimeType === "string" && v.mimeType.startsWith("image/");
    }).length : 0;
  if (imageCount < 1) return { status: "image-not-confirmed", eligible: false };
  return { status: "verified-existing-image-draft", eligible: true, imageCount };
}

export function buildGerardExistingDraftQueueMutation(postId: string) {
  if (postId !== GERARD_BUFFER_POST_ID) throw new Error("Only the verified existing Gérard Buffer draft can be promoted.");
  // Buffer's 2026-10-14 response confirmed an image is required again on
  // editPost, despite the generic API documentation's omission semantics.
  // Re-send only the SAME author-provided official cover, not a new image.
  const verifiedCover = officialMediaBySeed["gerard-et-gerard"];
  if (!verifiedCover || !verifiedCover.startsWith("https://")) throw new Error("Official Gérard cover required");
  return "mutation { editPost(input: { id: " + JSON.stringify(postId) +
    ", text: " + JSON.stringify(GERARD_BOOK_INSTAGRAM_CAPTION) +
    ", metadata: { instagram: { type: post, shouldShareToFeed: true } }" +
    ", assets: [{ image: { url: " + JSON.stringify(verifiedCover) + " } }]" +
    ", schedulingType: automatic, mode: addToQueue, saveToDraft: false" +
    " }) { __typename ... on PostActionSuccess { post { id status dueAt text channelId } } ... on InvalidInputError { message } } }";
}

// The general book circuit edits the draft in place with Gerard's exact copy
// and artwork. The historical Gerard recovery above remains available.
export function buildBufferBookQueueMutation(input: { postId: string; text: string; mediaUrl: string }) {
  return buildBufferBookPostMutation({ ...input, channelId: "", publish: true })
    .replace("createPost(input: {", "editPost(input: { id: " + JSON.stringify(input.postId) + ",")
    .replace(', channelId: ""', "");
}

export type BufferReservation = { fingerprint: string; status: string; post_id: string | null };
export type BufferBookPackage = { harvestId: string; text: string; mediaUrl: string; channelId: string; publish: boolean; dryRun: boolean };
export type BufferBookDependencies = {
  request: (query: string) => Promise<Record<string, any>>;
  load: () => Promise<BufferReservation[]>;
  claim: () => Promise<BufferReservation | null>;
  transition: (row: BufferReservation, status: string, postId: string | null) => Promise<boolean>;
  verifyMedia: () => Promise<void>;
};

export class BufferTransportError extends Error {
  constructor(public readonly code: string, public readonly httpStatus?: number) { super(code); }
}

/** No automatic mutation retry: a lost create/edit response stays reserved. */
export async function executeBufferBookPost(input: BufferBookPackage, deps: BufferBookDependencies) {
  const base = { provider: "buffer", harvestId: input.harvestId, scheduled: false, published: false, draftCreated: false, publishingEnabled: false, retryAllowed: false };
  let stage = "channel";
  let knownPostId: string | null = null;
  try {
    const channel = (await deps.request("query { channel(input:{id:" + JSON.stringify(input.channelId) + "}) { id service isDisconnected isLocked isQueuePaused } }")).data?.channel;
    if (channel?.id !== input.channelId || channel.service !== "instagram" ||
        channel.isDisconnected !== false || channel.isLocked !== false || channel.isQueuePaused !== false)
      return { ...base, status: "blocked", stage, reason: "BUFFER_CHANNEL_UNAVAILABLE" };
    stage = "reservation";
    const rows = (await deps.load()).filter(row => !["validation-rejected", "retry-authorized"].includes(row.status));
    if (rows.length > 1) return { ...base, status: "confirmation-required", stage, reason: "BUFFER_MULTIPLE_RESERVATIONS" };
    let row = rows[0];
    const read = async (id: string): Promise<Record<string, any>> => {
      stage = "provider-read";
      const post = (await deps.request("query { post(input:{id:" + JSON.stringify(id) + "}) { id channelId status text dueAt assets { id mimeType } } }")).data?.post;
      if (!post || post.id !== id || post.channelId !== input.channelId || post.text !== input.text ||
          !Array.isArray(post.assets) || !post.assets.some((a: any) => typeof a?.mimeType === "string" && a.mimeType.startsWith("image/")))
        throw new Error("Unverified provider post");
      return post;
    };
    const confirmed = (post: Record<string, any>) => {
      const sent = post.status === "sent";
      const scheduled = post.status === "scheduled" && typeof post.dueAt === "string" && Number.isFinite(Date.parse(post.dueAt)) && Date.parse(post.dueAt) > Date.now();
      if (!sent && !scheduled) return null;
      return { ...base, status: sent ? "confirmed-published" : "confirmed-scheduled", scheduled, published: sent,
        publishingEnabled: true, postId: post.id, channelId: post.channelId, providerStatus: post.status,
        publicationDate: post.dueAt ?? null, dueAt: post.dueAt ?? null };
    };
    let post: Record<string, any> | null = null;
    if (row) {
      if (!row.post_id) return { ...base, status: "confirmation-required", stage, reason: "BUFFER_CREATE_UNCERTAIN" };
      knownPostId = row.post_id;
      post = await read(row.post_id);
      const result = confirmed(post);
      if (result) {
        if (!input.dryRun && row.status !== "queued" && !(await deps.transition(row, "queued", row.post_id))) throw new Error("Concurrent change");
        return result;
      }
      // Even a still-visible draft cannot prove that a timed-out edit failed.
      if (!["draft-created", "pending"].includes(row.status) || post.status !== "draft")
        return { ...base, postId: row.post_id, providerStatus: post.status, status: "confirmation-required", stage, reason: "BUFFER_PROMOTION_UNCERTAIN" };
      if (row.status === "pending" && !input.dryRun) {
        if (!(await deps.transition(row, "draft-created", row.post_id))) throw new Error("Concurrent change");
        row = { ...row, status: "draft-created" };
      }
    }
    stage = "media";
    await deps.verifyMedia();
    if (input.dryRun) return { ...base, status: "ready-to-schedule", stage: "preview", postId: row?.post_id ?? null, willPublish: false };
    if (!row) {
      stage = "reservation";
      const claimed = await deps.claim();
      if (!claimed) return { ...base, status: "confirmation-required", stage, reason: "BUFFER_ALREADY_RESERVED" };
      row = claimed;
      stage = "create-draft";
      const created = (await deps.request(buildBufferBookPostMutation({ ...input, publish: false }))).data?.createPost;
      if (created?.__typename === "InvalidInputError") {
        await deps.transition(row, "validation-rejected", null);
        return { ...base, status: "validation-rejected", stage, reason: "BUFFER_INVALID_INPUT" };
      }
      const id = created?.__typename === "PostActionSuccess" ? created.post?.id : null;
      if (typeof id !== "string" || !id.trim()) throw new Error("No verified identifier");
      knownPostId = id;
      // Persist the identifier before readback, including during outages.
      if (!(await deps.transition(row, "pending", id))) throw new Error("Concurrent change");
      row = { ...row, post_id: id };
      post = await read(id);
      if (post.status !== "draft") throw new Error("Creation was not a draft");
      if (!(await deps.transition(row, "draft-created", id))) throw new Error("Concurrent change");
      row = { ...row, status: "draft-created" };
    }
    if (!input.publish) return { ...base, status: "draft-created", postId: row.post_id, channelId: input.channelId, draftCreated: true, providerStatus: "draft" };
    stage = "promotion";
    if (!(await deps.transition(row, "promotion-pending", row.post_id))) throw new Error("Concurrent change");
    row = { ...row, status: "promotion-pending" };
    const queued = (await deps.request(buildBufferBookQueueMutation({ ...input, postId: row.post_id! }))).data?.editPost;
    if (queued?.__typename === "InvalidInputError") {
      await deps.transition(row, "promotion-rejected", row.post_id);
      return { ...base, postId: row.post_id, status: "validation-rejected", stage, reason: "BUFFER_INVALID_INPUT" };
    }
    if (queued?.__typename !== "PostActionSuccess" || queued.post?.id !== row.post_id) throw new Error("Unconfirmed edit");
    const result = confirmed(await read(row.post_id!));
    if (!result) throw new Error("No confirmed schedule");
    if (!(await deps.transition(row, "queued", row.post_id))) throw new Error("Concurrent change");
    return result;
  } catch (error) {
    return { ...base, status: "confirmation-required", stage, postId: knownPostId,
      reason: error instanceof BufferTransportError ? error.code : "BUFFER_RESPONSE_UNCONFIRMED",
      ...(error instanceof BufferTransportError && error.httpStatus ? { providerHttpStatus: error.httpStatus } : {}) };
  }
}
