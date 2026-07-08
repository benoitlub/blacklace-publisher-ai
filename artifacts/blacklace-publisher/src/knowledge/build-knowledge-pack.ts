import type { KnowledgeExtraction, KnowledgePack, KnowledgeTheme, Observation } from "@/models/knowledge-observatory";

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildKnowledgeThemes(extraction: KnowledgeExtraction): KnowledgeTheme[] {
  return [
    {
      id: "theme-capabilities",
      title: "Capacites detectees",
      items: extraction.features,
    },
    {
      id: "theme-patterns",
      title: "Patterns reutilisables",
      items: [...extraction.promptPatterns, ...extraction.workflowPatterns],
    },
    {
      id: "theme-product",
      title: "Lecture produit",
      items: [...extraction.businessModel, ...extraction.ux],
    },
    {
      id: "theme-risks",
      title: "Risques et limites",
      items: [...extraction.risks, ...extraction.weaknesses],
    },
  ];
}

export function buildKnowledgePack(observation: Observation, extraction: KnowledgeExtraction): KnowledgePack {
  const themes = buildKnowledgeThemes(extraction);

  return {
    id: createId("knowledge-pack"),
    title: `Knowledge Pack — ${observation.source.label}`,
    summary: `Pack genere depuis une ${observation.category.toLowerCase()} avec ${Math.round(observation.confidence * 100)}% de confiance.`,
    capabilities: extraction.features,
    patterns: [...extraction.promptPatterns, ...extraction.workflowPatterns],
    recommendations: [
      "Valider les connaissances utiles avant creation de Seeds",
      "Relier ce pack a un HarvestDraft si l'analyse produit un resultat exploitable",
      "Brancher un connecteur reel seulement apres validation du pipeline local",
    ],
    tags: [observation.category, ...observation.detectedTechnologies].map((tag) => tag.toLowerCase()),
    confidence: observation.confidence,
    generatedAt: new Date().toISOString(),
    sourceReferences: [observation.source],
    themes,
  };
}
