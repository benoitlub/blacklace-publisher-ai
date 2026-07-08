import type {
  GraftRequest,
  GraftSelectionResult,
  PublisherGreenhouseCutting,
  PublisherGreenhouseResource,
  TemporaryGraft,
  TemporaryGraftState,
} from "./types";

function createId(prefix: string, sourceId: string): string {
  return `${prefix}-${sourceId.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
}

function normalize(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

function intersection(left: string[], right: string[]): string[] {
  const rightSet = new Set(normalize(right));
  return normalize(left).filter((value) => rightSet.has(value));
}

function difference(left: string[], right: string[]): string[] {
  const rightSet = new Set(normalize(right));
  return normalize(left).filter((value) => !rightSet.has(value));
}

function stateFromStatus(status: PublisherGreenhouseCutting["status"]): TemporaryGraftState {
  if (status === "validated") return "validated";
  if (status === "rejected") return "retired";
  return "experimental";
}

function scoreCutting(cutting: PublisherGreenhouseCutting, request: GraftRequest): number {
  const required = normalize(request.requiredCapabilities);
  const matched = intersection(cutting.capabilities, required);
  const capabilityScore = required.length ? matched.length / required.length : 0;
  const preferredTools = normalize(request.preferredTools ?? []);
  const toolScore = preferredTools.length ? intersection(cutting.tools, preferredTools).length / preferredTools.length : 0;
  const statusBonus = cutting.status === "validated" ? 0.2 : cutting.status === "testing" ? 0.1 : cutting.status === "rejected" ? -0.4 : 0;

  return Math.max(0, Math.min(1, capabilityScore * 0.75 + toolScore * 0.15 + statusBonus + 0.1));
}

function toTemporaryGraft(cutting: PublisherGreenhouseCutting, request: GraftRequest): TemporaryGraft {
  const matchedCapabilities = intersection(cutting.capabilities, request.requiredCapabilities);
  const missingCapabilities = difference(request.requiredCapabilities, cutting.capabilities);
  const confidence = Number(scoreCutting(cutting, request).toFixed(2));

  return {
    graftId: createId("graft", cutting.id),
    sourceCuttingId: cutting.id,
    title: cutting.title,
    matchedCapabilities,
    missingCapabilities,
    tools: cutting.tools,
    confidence,
    state: stateFromStatus(cutting.status),
    notes: cutting.notes,
  };
}

export class GraftManager {
  selectGrafts(greenhouse: PublisherGreenhouseResource, request: GraftRequest): GraftSelectionResult {
    const maxGrafts = request.maxGrafts ?? 3;
    const grafts = greenhouse.cuttings
      .filter((cutting) => cutting.status !== "rejected")
      .map((cutting) => toTemporaryGraft(cutting, request))
      .filter((graft) => graft.matchedCapabilities.length > 0)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxGrafts);

    return {
      generatedAt: new Date().toISOString(),
      requiredCapabilities: normalize(request.requiredCapabilities),
      grafts,
    };
  }
}
