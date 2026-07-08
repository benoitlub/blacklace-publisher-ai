import type { KnowledgeExtraction, Observation } from "@/models/knowledge-observatory";

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function extractKnowledge(observation: Observation): KnowledgeExtraction {
  const techList = observation.detectedTechnologies.join(", ");

  return {
    id: createId("extraction"),
    observationId: observation.id,
    features: [
      "Analyse d'une source heterogene",
      "Classification par categorie",
      "Transformation en signaux reutilisables",
      "Preparation d'un Knowledge Pack exportable",
    ],
    businessModel: [
      "Freemium, abonnement ou service accompagne a verifier",
      "Valeur potentielle : reduction du temps de veille et de synthese",
    ],
    ux: [
      "Flux lisible en etapes : Source, Observation, Extraction, Knowledge, Pack",
      "Resultat structure en cartes plutot qu'en conversation",
    ],
    assumedArchitecture: [
      "Connecteur de source interchangeable",
      "Extracteur local deterministe pour la V1",
      `Technologies supposees : ${techList}`,
    ],
    possibleAutomations: [
      "Creer un HarvestDraft apres analyse",
      "Transformer une connaissance validee en Seed",
      "Comparer plusieurs observations d'un meme outil",
    ],
    promptPatterns: [
      "Observer avant de generer",
      "Extraire des capacites plutot que produire un texte final",
      "Separer source, interpretation et recommandation",
    ],
    workflowPatterns: [
      "Source vers Observation",
      "Observation vers Knowledge Pack",
      "Export mock vers Octopus sans dependance directe",
    ],
    innovations: [
      "Publisher devient un curateur de connaissances pour Octopus Engine",
      "La publication devient une consequence possible, pas la mission centrale",
    ],
    risks: [
      "Risque de mock trop visible si les etapes ne sont pas bien expliquees",
      "Risque de recreer une deuxieme architecture si Seeds et Harvests ne sont pas reutilises",
    ],
    strengths: [
      "Architecture decouplee",
      "Utilisable sans API externe",
      "Compatible avec les connecteurs futurs",
    ],
    weaknesses: [
      "Pas de scraping reel dans cette fondation",
      "Pas d'analyse PDF reelle pour l'instant",
      "Confiance limitee tant que l'analyse reste locale",
    ],
  };
}
