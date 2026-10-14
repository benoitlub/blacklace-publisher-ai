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
