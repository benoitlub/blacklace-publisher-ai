import type { KnowledgePackage } from "../knowledge/synthesizer";

export type DeliverableKind = "instagram-post" | "landing-page" | "newsletter" | "documentation";

export interface ProductionRequest {
  id: string;
  parcelId: string;
  parcelName: string;
  knowledgePackageVersion: number;
  deliverableKind: DeliverableKind;
  title: string;
  objective: string;
  audience: string;
  facts: string[];
  summary: string;
  createdAt: string;
}

export function buildProductionRequest(
  knowledgePackage: KnowledgePackage,
  deliverableKind: DeliverableKind = "documentation",
): ProductionRequest {
  if (!knowledgePackage?.parcelId) throw new Error("knowledge-package-missing-parcel");
  if (knowledgePackage.status === "empty" || knowledgePackage.coverage <= 0) {
    throw new Error(`knowledge-package-empty:${knowledgePackage.parcelId}`);
  }

  const createdAt = new Date().toISOString();
  return {
    id: `production:${knowledgePackage.parcelId}:${knowledgePackage.version}:${Date.now()}`,
    parcelId: knowledgePackage.parcelId,
    parcelName: knowledgePackage.parcelName,
    knowledgePackageVersion: knowledgePackage.version,
    deliverableKind,
    title: `${knowledgePackage.parcelName} — ${deliverableKind}`,
    objective: `Créer un livrable ${deliverableKind} directement utilisable à partir des connaissances vérifiées de ${knowledgePackage.parcelName}.`,
    audience: "public cible de la parcelle",
    facts: knowledgePackage.facts.map((fact) => fact.statement).slice(0, 12),
    summary: knowledgePackage.summary,
    createdAt,
  };
}
