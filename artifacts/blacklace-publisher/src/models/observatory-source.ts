import type { KnowledgePack, SourceKind } from "@/models/knowledge-observatory";
import type { ObservationDecision, ObservationOctopusEnrichment } from "@/models/observation-memory";

/**
 * Une source telle qu'elle existe **côté serveur**, dans la table Neon
 * `observatory_sources` — par opposition à ObservationMemoryEntry, qui n'est
 * que le cache navigateur de cette même fiche.
 */
export interface ObservatorySourceRecord {
  id: string;
  sourceKey: string;
  kind: SourceKind;
  value: string;
  name: string;
  category: string | null;
  summary: string | null;
  averageConfidence: number;
  tags: string[];
  decision: ObservationDecision;
  observationCount: number;
  pack: KnowledgePack | null;
  octopus: ObservationOctopusEnrichment | null;
  firstObservedAt: string;
  lastObservedAt: string;
  processedAt: string | null;
}
