export interface PublisherPersona {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly tone: string;
  readonly goals: string[];
  readonly capabilities: string[];
  readonly knowledgeSources: string[];
  readonly source: "notion" | "local";
}

export const LOCAL_PERSONAS: PublisherPersona[] = [
  {
    id: "persona-natasha",
    name: "Natasha",
    role: "Direction editoriale",
    tone: "officiel, structure, clair",
    goals: ["Transformer les recoltes en publications lisibles", "Maintenir la coherence editoriale"],
    capabilities: ["text.post", "metadata.tags"],
    knowledgeSources: ["Blacklace", "Publisher"],
    source: "local"
  },
  {
    id: "persona-marty",
    name: "Marty",
    role: "Operations contenu",
    tone: "direct, pratique, leger",
    goals: ["Preparer des contenus actionnables", "Adapter les messages aux canaux"],
    capabilities: ["text.post", "metadata.tags"],
    knowledgeSources: ["Publisher", "GitHub"],
    source: "local"
  },
  {
    id: "persona-feuch",
    name: "Feuch",
    role: "Direction creative",
    tone: "tranchant, visionnaire, ironique",
    goals: ["Preserver la coherence Blacklace", "Arbitrer les angles editoriaux forts"],
    capabilities: ["text.post", "text.thread", "metadata.tags"],
    knowledgeSources: ["Bible Blacklace", "Publisher"],
    source: "local"
  },
  {
    id: "persona-birdy",
    name: "Birdy",
    role: "Veille et reseaux",
    tone: "alerte, concis, social",
    goals: ["Identifier les opportunites de publication", "Adapter les contenus aux plateformes sociales"],
    capabilities: ["text.post", "metadata.tags"],
    knowledgeSources: ["Publisher", "Knowledge Source"],
    source: "local"
  },
  {
    id: "persona-clochette",
    name: "Clochette",
    role: "Coordination client",
    tone: "clair, rassurant, operationnel",
    goals: ["Transformer les intentions client en actions lisibles", "Maintenir le suivi des parcelles"],
    capabilities: ["text.summary", "metadata.tags"],
    knowledgeSources: ["Publisher", "Constitution Octopus"],
    source: "local"
  },
  {
    id: "persona-sofia",
    name: "Sofia",
    role: "Analyste documentaire",
    tone: "precis, synthetique, methodique",
    goals: ["Extraire les angles utiles", "Relier les contenus aux sources"],
    capabilities: ["text.summary", "text.post"],
    knowledgeSources: ["Constitution Octopus", "Bible Blacklace", "Publisher"],
    source: "local"
  }
];

export async function loadPublisherPersonas(): Promise<PublisherPersona[]> {
  try {
    const response = await fetch("/api/personas");
    if (!response.ok) {
      throw new Error("Personas indisponibles");
    }

    const payload = (await response.json()) as { personas?: PublisherPersona[] };
    return Array.isArray(payload.personas) && payload.personas.length > 0 ? payload.personas : LOCAL_PERSONAS;
  } catch {
    return LOCAL_PERSONAS;
  }
}
