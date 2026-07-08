import type { ObservationMemoryEntry } from "@/models/observation-memory";

export type GreenhouseMaturity = "graine" | "pousse" | "plante" | "arbre";

export interface GreenhouseCluster {
  id: string;
  title: string;
  maturity: GreenhouseMaturity;
  observationCount: number;
  toolCount: number;
  firstObservedAt: string;
  lastObservedAt: string;
  averageConfidence: number;
  entries: ObservationMemoryEntry[];
  sharedTags: string[];
  dominantCategory: string;
  signals: string[];
}

export interface GreenhouseReport {
  generatedAt: string;
  clusters: GreenhouseCluster[];
  totalEntries: number;
  totalObservations: number;
}
