/**
 * Optional Buffer transport for Publisher.
 * Deliberately dry-run only: no credentials, API calls or publication side effects.
 * Metricool remains the existing production route.
 */
export type SocialTransport = "metricool" | "buffer";
export type TransportDecision = {
  transport: SocialTransport;
  mode: "production" | "dry-run";
  reason: string;
};
export type TransportContext = {
  requested?: SocialTransport;
  metricoolAvailable: boolean;
  bufferConnected: boolean;
  allowBufferProduction?: boolean;
};
export function chooseSocialTransport(ctx: TransportContext): TransportDecision {
  if (ctx.requested === "buffer") {
    return {
      transport: "buffer",
      mode: "dry-run",
      reason: ctx.bufferConnected
        ? "buffer-adapter-awaiting-verified-publish-integration"
        : "buffer-not-connected",
    };
  }
  if (ctx.metricoolAvailable) {
    return { transport: "metricool", mode: "production", reason: "existing-working-route" };
  }
  return {
    transport: "buffer",
    mode: "dry-run",
    reason: ctx.bufferConnected
      ? "metricool-unavailable-buffer-dry-run"
      : "no-publishing-transport-connected",
  };
}
export function previewBufferPost(input: {
  text: string;
  mediaUrl?: string | null;
  destination?: string | null;
}) {
  const text = input.text.trim();
  return {
    provider: "buffer" as const,
    mode: "dry-run" as const,
    publishable: Boolean(text),
    text,
    mediaUrl: input.mediaUrl ?? null,
    destination: input.destination ?? null,
    requiresConnection: true,
    willPublish: false,
  };
}
