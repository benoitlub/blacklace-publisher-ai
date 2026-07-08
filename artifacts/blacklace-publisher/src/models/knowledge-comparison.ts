import type { ObservationMemoryEntry } from "@/models/observation-memory";

export type ComparisonDecision = "ignore" | "watch" | "seed" | "compare" | "article";

export interface KnowledgeComparison {
  id: string;
  left: ObservationMemoryEntry;
  right: ObservationMemoryEntry;
  similarityScore: number;
  noveltyScore: number;
  sharedCapabilities: string[];
  leftOnlyCapabilities: string[];
  rightOnlyCapabilities: string[];
  sharedPatterns: string[];
  sharedTags: string[];
  recommendation: ComparisonDecision;
  rationale: string;
}

export interface KnowledgeComparisonReport {
  generatedAt: string;
  comparisons: KnowledgeComparison[];
  strongestPair?: KnowledgeComparison;
  mostNovelPair?: KnowledgeComparison;
}
