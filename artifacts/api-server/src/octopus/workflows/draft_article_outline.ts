import type { WorkflowDefinition } from "octopus-engine";

/**
 * Workflow: draft_article_outline
 *
 * Steps:
 *   1. extract_topic — extrait le sujet éditorial depuis le texte utilisateur
 *   2. build_outline — construit un plan structuré
 *
 * Déclaratif. Pas de LLM. Pas de réseau.
 */
export const draftArticleOutlineWorkflow: WorkflowDefinition = {
  id: "draft_article_outline",
  version: "1.0.0",
  description: "Génère un plan d'article structuré à partir d'une intention éditoriale.",
  steps: [
    {
      moduleId: "extract_topic",
      input: {},
    },
    {
      moduleId: "build_outline",
      input: {},
    },
  ],
};
