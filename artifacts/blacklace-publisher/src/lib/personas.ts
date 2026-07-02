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
    id: "persona-neutre",
    name: "neutre",
    role: "Interface neutre Publisher",
    tone: "clair, sobre, direct",
    goals: ["Structurer l'intention client"],
    capabilities: ["mission.capture"],
    knowledgeSources: ["Publisher"],
    source: "local"
  },
  {
    id: "persona-marketing",
    name: "conseiller marketing",
    role: "Conseil marketing",
    tone: "pragmatique, commercial, oriente action",
    goals: ["Transformer l'intention en campagne"],
    capabilities: ["text.post", "metadata.tags"],
    knowledgeSources: ["Publisher", "Notion"],
    source: "local"
  },
  {
    id: "persona-sales",
    name: "assistant commercial",
    role: "Assistant commercial",
    tone: "concis, utile, oriente prospection",
    goals: ["Identifier les prochaines actions commerciales"],
    capabilities: ["text.post", "metadata.tags"],
    knowledgeSources: ["Publisher"],
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
