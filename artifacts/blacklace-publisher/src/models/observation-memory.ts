import type { KnowledgePack, SourceKind } from "@/models/knowledge-observatory";

export type ObservationDecision = "watch" | "ignore" | "seed" | "harvest" | "article" | "compare";

export interface ObservationOctopusEnrichment {
  relevanceScore: number;
  noveltyScore: number;
  harvestPriority: "observe" | "prepare" | "prioritize";
  editorialSignal: "new" | "emerging" | "established" | "persistent";
  relatedCount: number;
  observedCount: number;
  strongestRelation: number;
  trend: string;
  summary: string;
  receivedAt: string;
}

export interface ObservationMemoryEntry {
  id: string;
  name: string;
  sourceKind: SourceKind;
  sourceValue: string;
  category: string;
  firstObservedAt: string;
  lastObservedAt: string;
  observationCount: number;
  averageConfidence: number;
  tags: string[];
  comparableNames: string[];
  currentDecision: ObservationDecision;
  lastSummary: string;
  lastPack: KnowledgePack;
  octopus?: ObservationOctopusEnrichment;
  history: Array<{
    observedAt: string;
    confidence: number;
    packId: string;
    summary: string;
  }>;
}
