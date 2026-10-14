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
  // No assets replacement: Buffer preserves the verified cover already attached.
  return "mutation { editPost(input: { id: " + JSON.stringify(postId) +
    ", text: " + JSON.stringify(GERARD_BOOK_INSTAGRAM_CAPTION) +
    ", metadata: { instagram: { type: post, shouldShareToFeed: true } }" +
    ", schedulingType: automatic, mode: addToQueue, saveToDraft: false" +
    " }) { __typename ... on PostActionSuccess { post { id status dueAt text channelId } } ... on InvalidInputError { message } } }";
}
