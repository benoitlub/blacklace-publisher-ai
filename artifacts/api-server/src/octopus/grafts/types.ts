export type GreenhouseCuttingStatus = "candidate" | "testing" | "validated" | "rejected";
export type TemporaryGraftState = "experimental" | "validated" | "reusable" | "retired";

export interface PublisherGreenhouseCutting {
  id: string;
  title: string;
  capabilities: string[];
  tools: string[];
  status: GreenhouseCuttingStatus;
  notes: string;
}

export interface PublisherGreenhouseResource {
  source: string;
  version: string;
  generatedAt: string;
  contract: "publisher-greenhouse-cuttings";
  cuttings: PublisherGreenhouseCutting[];
}

export interface GraftRequest {
  missionId?: string;
  requiredCapabilities: string[];
  preferredTools?: string[];
  maxGrafts?: number;
}

export interface TemporaryGraft {
  graftId: string;
  sourceCuttingId: string;
  title: string;
  matchedCapabilities: string[];
  missingCapabilities: string[];
  tools: string[];
  confidence: number;
  state: TemporaryGraftState;
  notes: string;
}

export interface GraftSelectionResult {
  generatedAt: string;
  requiredCapabilities: string[];
  grafts: TemporaryGraft[];
}
