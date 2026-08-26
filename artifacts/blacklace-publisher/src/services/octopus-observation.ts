/**
 * Traduction Publisher d'une observation renvoyée par Octopus.
 *
 * L'appel réseau lui-même vit désormais dans le Worker : POST
 * /api/observatory/sources persiste la source dans Neon *puis* interroge
 * Octopus, pour qu'une panne d'Octopus ne fasse plus perdre la source. Ce
 * module ne conserve que le contrat de données partagé avec le Worker
 * (publisher-worker/src/octopus-observation.ts).
 */
export type PublisherOctopusTranslation = {
  relevanceScore: number;
  noveltyScore: number;
  harvestPriority: "observe" | "prepare" | "prioritize";
  editorialSignal: "new" | "emerging" | "established" | "persistent";
  relatedCount: number;
  observedCount: number;
  strongestRelation: number;
  trend: string;
  summary: string;
};
