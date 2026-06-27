import type { MissionDefinition } from "octopus-engine";

/**
 * MissionCatalog — registre versionné des missions reconnues.
 *
 * Ajouter une mission ici est le point d'entrée explicite pour une nouvelle
 * intention Publisher. Le MissionPlanner et le Coordinator ne changent pas
 * quand une mission est ajoutée au catalogue.
 */
export const MISSION_CATALOG: MissionDefinition[] = [
  {
    id: "draft_article_outline",
    version: "1.0.0",
    description:
      "Génère un plan d'article structuré (titre, sections, angle éditorial) à partir d'une intention éditoriale.",
    requiredCapabilities: ["text_generation", "outline_builder"],
    workflowId: "draft_article_outline",
  },
  {
    id: "analyze_client_profile",
    version: "1.0.0",
    description:
      "Analyse une description client et produit une fiche de profil structurée (segments, résumé, confiance).",
    requiredCapabilities: ["text_analysis", "profile_synthesizer"],
    workflowId: "analyze_client_profile",
  },
];

export function getMissionById(id: string): MissionDefinition | undefined {
  return MISSION_CATALOG.find((m) => m.id === id);
}

export function listMissionIds(): string[] {
  return MISSION_CATALOG.map((m) => m.id);
}
