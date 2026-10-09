/**
 * Safe transport routing. Buffer remains a dry-run until its publishing
 * integration is authenticated and verified. Never auto-retry an uncertain
 * delivery: that could duplicate a live post.
 */
export type SocialTransport = "metricool" | "buffer";
export type DeliveryState = "not-attempted" | "confirmed-failed" | "unknown" | "confirmed-sent";
export type TransportDecision = {
  transport: SocialTransport | null;
  mode: "production" | "dry-run" | "hold";
  reason: string;
};
export type TransportContext = {
  requested?: SocialTransport;
  metricoolAvailable: boolean;
  bufferConnected: boolean;
  allowBufferProduction?: boolean;
  previousDelivery?: DeliveryState;
};
export function chooseSocialTransport(ctx: TransportContext): TransportDecision {
  if (ctx.previousDelivery === "confirmed-sent") {
    return { transport: null, mode: "hold", reason: "already-published" };
  }
  if (ctx.previousDelivery === "unknown") {
    return { transport: null, mode: "hold", reason: "delivery-unconfirmed-reconcile-before-retry" };
  }
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
    transport: ctx.bufferConnected ? "buffer" : null,
    mode: ctx.bufferConnected ? "dry-run" : "hold",
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
