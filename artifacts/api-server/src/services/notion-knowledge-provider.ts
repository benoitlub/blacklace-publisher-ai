import { fetchBlacklaceKnowledgeWithDiagnostics, type BlacklaceKnowledgeItem } from "./notion";
import { logger } from "../lib/logger";

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

export interface MemorySourceSummary {
  readonly id: string;
  readonly label: string;
  readonly status: "real" | "mock";
  readonly charCount: number;
  readonly syncedAt: string;
  readonly excerpt: string;
}

const LOCAL_PERSONAS: PublisherPersona[] = [
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

const MEMORY_LABELS = [
  "Constitution Octopus",
  "Bible Blacklace",
  "Bible Ilvaard",
  "Kif & Molla",
  "Vacances Interdites",
  "Publisher"
];

let cachedPersonas: PublisherPersona[] = LOCAL_PERSONAS;
let cachedPersonaSource: "notion" | "local" = "local";

export async function warmNotionKnowledgeProvider(): Promise<void> {
  const personas = await loadPublisherPersonas();
  logger.info({ count: personas.length, source: cachedPersonaSource }, "Publisher personas loaded");
}

export async function loadPublisherPersonas(): Promise<PublisherPersona[]> {
  const diagnostics = await fetchBlacklaceKnowledgeWithDiagnostics();
  if (!diagnostics.connected) {
    cachedPersonas = LOCAL_PERSONAS;
    cachedPersonaSource = "local";
    logger.info(
      { notionSource: diagnostics.source, connected: diagnostics.connected, itemCount: diagnostics.items.length, detectedPersonas: 0 },
      "Publisher personas fallback to local because Notion is unavailable"
    );
    return cachedPersonas;
  }

  const notionPersonas = diagnostics.items.flatMap(parsePersonaFromKnowledgeItem);
  cachedPersonas = notionPersonas.length > 0 ? notionPersonas : LOCAL_PERSONAS;
  cachedPersonaSource = notionPersonas.length > 0 ? "notion" : "local";
  logger.info(
    {
      notionSource: diagnostics.source,
      title: diagnostics.title,
      connected: diagnostics.connected,
      itemCount: diagnostics.items.length,
      detectedPersonas: notionPersonas.length,
      returnedPersonas: cachedPersonas.length,
      returnedSource: cachedPersonaSource
    },
    notionPersonas.length > 0 ? "Publisher personas loaded from Notion" : "Publisher personas fallback to local because no structured Notion persona was found"
  );
  return cachedPersonas;
}

export function getCachedPublisherPersonas(): PublisherPersona[] {
  return cachedPersonas;
}

export async function loadMemorySourceSummaries(): Promise<MemorySourceSummary[]> {
  const diagnostics = await fetchBlacklaceKnowledgeWithDiagnostics();
  const now = new Date().toISOString();

  return MEMORY_LABELS.map((label) => {
    const item = findKnowledgeItem(label, diagnostics.items);
    const content = item?.content ?? "";
    return {
      id: slugify(label),
      label,
      status: diagnostics.connected && item && !item.isMock ? "real" : "mock",
      charCount: content.length,
      syncedAt: now,
      excerpt: content.slice(0, 500)
    };
  });
}

function parsePersonaFromKnowledgeItem(item: BlacklaceKnowledgeItem): PublisherPersona[] {
  const haystack = `${item.title} ${item.tags.join(" ")}`.toLowerCase();
  if (!haystack.includes("persona") && !haystack.includes("agent")) {
    return [];
  }

  const parsed = tryParsePersonaJson(item);
  if (parsed) {
    return [parsed];
  }

  return [
    {
      id: `notion-${item.id}`,
      name: item.title.replace(/^persona\s*[-:]\s*/i, "").trim() || "Persona Notion",
      role: item.universe,
      tone: firstLine(item.content) || "ton editorial",
      goals: extractList(item.content, "goals"),
      capabilities: extractList(item.content, "capabilities"),
      knowledgeSources: [item.universe, item.title],
      source: "notion"
    }
  ];
}

function tryParsePersonaJson(item: BlacklaceKnowledgeItem): PublisherPersona | null {
  try {
    const parsed = JSON.parse(item.content) as Partial<PublisherPersona>;
    if (!parsed.name || !parsed.role || !parsed.tone) {
      return null;
    }

    return {
      id: typeof parsed.id === "string" ? parsed.id : `notion-${item.id}`,
      name: parsed.name,
      role: parsed.role,
      tone: parsed.tone,
      goals: Array.isArray(parsed.goals) ? parsed.goals.filter(isString) : [],
      capabilities: Array.isArray(parsed.capabilities) ? parsed.capabilities.filter(isString) : [],
      knowledgeSources: Array.isArray(parsed.knowledgeSources) ? parsed.knowledgeSources.filter(isString) : [item.universe],
      source: "notion"
    };
  } catch {
    return null;
  }
}

function findKnowledgeItem(label: string, items: readonly BlacklaceKnowledgeItem[]): BlacklaceKnowledgeItem | undefined {
  const normalizedLabel = normalize(label);
  return items.find((item) => normalize(item.title).includes(normalizedLabel) || normalize(item.universe).includes(normalizedLabel));
}

function firstLine(content: string): string {
  return content.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
}

function extractList(content: string, label: string): string[] {
  const pattern = new RegExp(`${label}\\s*:?\\s*([^\\n]+)`, "i");
  const match = content.match(pattern);
  if (!match) {
    return [];
  }

  return match[1].split(/[,;|]/).map((item) => item.trim()).filter(Boolean);
}

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function slugify(value: string): string {
  return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
