import type { WorkflowDefinition } from "octopus-engine";

/**
 * Workflow: analyze_client_profile
 *
 * Steps:
 *   1. extract_client_data — extrait les données brutes depuis le contexte
 *   2. synthesize_profile  — construit une fiche de profil structurée
 *
 * Déclaratif. Pas de LLM. Pas de réseau.
 */
export const analyzeClientProfileWorkflow: WorkflowDefinition = {
  id: "analyze_client_profile",
  version: "1.0.0",
  description: "Analyse un profil client et produit une fiche de synthèse structurée.",
  steps: [
    {
      moduleId: "extract_client_data",
      input: {},
    },
    {
      moduleId: "synthesize_profile",
      input: {},
    },
  ],
};
