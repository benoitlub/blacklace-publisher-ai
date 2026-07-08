import type { KnowledgePack, SourceKind } from "@/models/knowledge-observatory";

export type ObservationDecision = "watch" | "ignore" | "seed" | "harvest" | "article" | "compare";

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
  history: Array<{
    observedAt: string;
    confidence: number;
    packId: string;
    summary: string;
  }>;
}
