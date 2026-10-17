/**
 * Read-only 3D Tool Pack for Publisher's Connection Broker.
 *
 * No Meshy/Tripo requests are made here. Connection evidence is supplied by
 * Publisher's existing authenticated Composio inventory, not inferred from an
 * API key alone. A connection does NOT imply sufficient credits.
 */
export type ThreeDProviderSlug = "meshy" | "tripo3d";

export interface ThreeDConnectionEvidence {
  slug: ThreeDProviderSlug;
  connected: boolean;
  discoveredTools: string[];
}

export interface ThreeDPreflightInput {
  title?: string;
  imageCount?: number;
  format?: "glb";
  budgetApproved?: boolean;
}

const PROVIDERS = [
  {
    slug: "meshy" as const,
    tool: "MESHY_CREATE_IMAGE_TO_3D_TASK",
    views: 4,
    output: "glb",
  },
  {
    slug: "tripo3d" as const,
    tool: "TRIPO3D_GENERATE_MODEL_FROM_IMAGE",
    views: 1,
    output: "glb",
  },
];

export function buildThreeDToolPack(input: ThreeDPreflightInput, evidence: ThreeDConnectionEvidence[]) {
  const imageCount = input.imageCount ?? 4;
  if (!Number.isInteger(imageCount) || imageCount < 1 || imageCount > 4) {
    throw new Error("imageCount must be an integer from 1 to 4");
  }
  if (input.format && input.format !== "glb") {
    throw new Error("Only GLB output is supported");
  }
  const tools = PROVIDERS.map((provider) => {
    const connection = evidence.find((item) => item.slug === provider.slug);
    const connected = connection?.connected === true;
    const availableTool = connection?.discoveredTools.includes(provider.tool) === true;
    const supportsViews = imageCount <= provider.views;
    return {
      id: `composio:${provider.slug}:${provider.tool}`,
      provider: provider.slug,
      capability: "asset.generate.3d",
      operation: "image-to-3d",
      tool: provider.tool,
      connected,
      toolAvailable: availableTool,
      supportsViews,
      connectionStatus: connected ? "connected" : "authorization-required",
      credits: "unknown" as const,
      executable: false as const,
      reason: !supportsViews ? "This provider cannot accept all reference views"
        : !connected ? "A connected account is required"
        : !availableTool ? "The 3D generation action was not confirmed by tool discovery"
        : "Provider appears connected, but credit balance and paid authorization are unverified",
    };
  });
  const selected = tools.find(t => t.connected && t.toolAvailable && t.supportsViews) ?? null;
  return {
    contract: "publisher-3d-tool-pack-v1" as const,
    status: "planned" as const,
    capability: "asset.3d.plan" as const,
    title: String(input.title || "Creature-Sync Console").slice(0, 140),
    imageCount,
    format: "glb" as const,
    execution: "dry-run" as const,
    executable: false as const,
    requiresHumanAuthorization: true as const,
    cost: { currency: "provider-credits", amount: null, verified: false },
    selected,
    tools,
    nextAction: selected
      ? "Verify real credits and request explicit per-job approval before allowing 3D execution"
      : "Connect an eligible 3D provider in Publisher Local technique, then rerun preflight",
    warning: "This is a planning contract only: no GLB has been generated and no credits have been consumed.",
  };
}
