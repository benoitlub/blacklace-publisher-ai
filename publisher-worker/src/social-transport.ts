/**
 * Safe transport routing. Buffer can enter production only when a verified
 * connection and an explicit production permission are both present.
 * Never auto-retry an uncertain delivery: that could duplicate a live post.
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
    if (ctx.bufferConnected && ctx.allowBufferProduction) {
      return { transport: "buffer", mode: "production", reason: "buffer-verified-and-explicitly-enabled" };
    }
    return {
      transport: "buffer",
      mode: "dry-run",
      reason: ctx.bufferConnected
        ? "buffer-adapter-awaiting-verified-publish-integration"
        : "buffer-not-connected",
    };
  }
  if (ctx.requested === "metricool" && !ctx.metricoolAvailable) {
    return { transport: "metricool", mode: "hold", reason: "requested-metricool-unavailable" };
  }
  if (ctx.metricoolAvailable) {
    return { transport: "metricool", mode: "production", reason: "existing-working-route" };
  }
  return {
    transport: ctx.bufferConnected ? "buffer" : null,
    mode: ctx.bufferConnected && ctx.allowBufferProduction ? "production" : ctx.bufferConnected ? "dry-run" : "hold",
    reason: ctx.bufferConnected && ctx.allowBufferProduction
      ? "metricool-unavailable-buffer-verified-fallback"
      : ctx.bufferConnected
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


/**
 * Read-only inventory for issue #144. This does not grant permissions or
 * perform provider calls; only verified observations may be executable.
 */
export type SocialCapabilityObservation = {
  provider: SocialTransport;
  account: string;
  network: string;
  connected: boolean | null;
  canSchedule: boolean | null;
  supportedMedia: readonly ("text" | "image" | "video")[];
  verifiedAt: string | null;
  source: string | null;
  blocker?: string | null;
};

export type SocialCapabilityResult = {
  status: "available" | "no-verified-transport";
  candidates: Array<{ provider: SocialTransport; account: string; network: string; status: "available" | "blocked"; reason: string }>;
};

/** Never substitute a different social account, even if it has a working transport. */
export function inspectSocialCapabilities(input: {
  targetAccount: string;
  network: string;
  media: "text" | "image" | "video";
  observations: readonly SocialCapabilityObservation[];
}): SocialCapabilityResult {
  const target = input.targetAccount.trim().replace(/^@/, "").toLowerCase();
  const network = input.network.trim().toLowerCase();
  const candidates = input.observations
    .filter((item) => item.account.trim().replace(/^@/, "").toLowerCase() === target &&
      item.network.trim().toLowerCase() === network)
    .map((item) => {
      let reason = "verified-scheduling-capability";
      if (!item.verifiedAt || !item.source) reason = "capability-not-verified";
      else if (item.connected !== true) reason = item.connected === false ? "account-disconnected" : "connection-unknown";
      else if (item.canSchedule !== true) reason = item.canSchedule === false ? "scheduling-not-allowed" : "scheduling-unverified";
      else if (!item.supportedMedia.includes(input.media)) reason = "media-not-supported";
      else if (item.blocker) reason = item.blocker;
      return { provider: item.provider, account: item.account, network: item.network,
        status: reason === "verified-scheduling-capability" ? "available" as const : "blocked" as const, reason };
    });
  return {
    status: candidates.some((item) => item.status === "available") ? "available" : "no-verified-transport",
    candidates,
  };
}
