import { logger } from "../lib/logger";
import { getConnectorSecret } from "./connector-settings";

const NOTION_API_URL = "https://api.notion.com/v1";

function getNotionConfig() {
  return {
    apiKey: process.env.NOTION_API_KEY ?? getConnectorSecret("notion", "apiKey"),
    databaseId: process.env.NOTION_DATABASE_ID ?? getConnectorSecret("notion", "databaseId"),
    pageId: process.env.NOTION_PAGE_ID ?? getConnectorSecret("notion", "pageId"),
  };
}

export interface BlacklaceKnowledgeItem {
  id: string;
  title: string;
  universe: string;
  content: string;
  tags: string[];
  isMock: boolean;
}

export interface NotionDiagnostics {
  connected: boolean;
  source: "notion" | "mock";
  title: string | null;
  charCount: number;
  sectionCount: number;
  error: string | null;
  items: BlacklaceKnowledgeItem[];
}

const MOCK_KNOWLEDGE: BlacklaceKnowledgeItem[] = [
  {
    id: "mock-1",
    title: "Blacklace — Bible narrative",
    universe: "Blacklace",
    content:
      "Blacklace est un univers de science-fiction absurde où des entités non-humaines observent les comportements des bipèdes avec une curiosité mêlée de scepticisme bienveillant.",
    tags: ["bible", "univers", "blacklace"],
    isMock: true,
  },
  {
    id: "mock-2",
    title: "Creature-Sync — Protocole d'observation",
    universe: "Creature-Sync",
    content:
      "Creature-Sync est un protocole de science participative permettant l'observation et la documentation des espèces sauvages via une application mobile et des agents IA naturalistes.",
    tags: ["creature-sync", "science", "nature"],
    isMock: true,
  },
  {
    id: "mock-3",
    title: "Kif & Molla — Présentation des personnages",
    universe: "Kif & Molla",
    content:
      "Kif et Molla sont deux personnages complémentaires dont les aventures explorent les thèmes de l'amitié, de la différence et de l'absurde du quotidien à travers des épisodes illustrés.",
    tags: ["kif-molla", "personnages", "bande-dessinée"],
    isMock: true,
  },
  {
    id: "mock-4",
    title: "TERRA — Citations cosmiques",
    universe: "TERRA",
    content:
      "TERRA est un projet de citations philosophiques et poétiques ancrées dans une cosmologie fictive. Chaque citation est attribuée à un penseur imaginaire de civilisations lointaines.",
    tags: ["terra", "philosophie", "poésie"],
    isMock: true,
  },
  {
    id: "mock-5",
    title: "Pro.Hibited — Concept éditorial",
    universe: "Pro.Hibited",
    content:
      "Pro.Hibited Online est un espace éditorial explorant les zones grises de la création : contenus non conventionnels, formats hybrides, expériences narratives limites.",
    tags: ["pro-hibited", "editorial", "expérimental"],
    isMock: true,
  },
];

function mockDiagnostics(error: string | null = null): NotionDiagnostics {
  const charCount = MOCK_KNOWLEDGE.reduce((sum, item) => sum + item.content.length, 0);
  return {
    connected: false,
    source: "mock",
    title: "Base de connaissances simulée (5 univers)",
    charCount,
    sectionCount: MOCK_KNOWLEDGE.length,
    error,
    items: MOCK_KNOWLEDGE,
  };
}

interface NotionDbPage {
  id: string;
  properties: {
    Name?: { title: Array<{ plain_text: string }> };
    Universe?: { select?: { name: string } };
    Content?: { rich_text: Array<{ plain_text: string }> };
    Tags?: { multi_select: Array<{ name: string }> };
  };
}

async function fetchFromDatabase(): Promise<NotionDiagnostics> {
  const { apiKey, databaseId } = getNotionConfig();
  const response = await fetch(`${NOTION_API_URL}/databases/${databaseId}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ page_size: 100 }),
  });

  if (!response.ok) {
    throw new Error(`Notion API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { results: NotionDbPage[] };

  const items: BlacklaceKnowledgeItem[] = data.results.map((page) => ({
    id: page.id,
    title: page.properties.Name?.title?.[0]?.plain_text ?? "Sans titre",
    universe: page.properties.Universe?.select?.name ?? "Blacklace",
    content: page.properties.Content?.rich_text?.[0]?.plain_text ?? "",
    tags: page.properties.Tags?.multi_select?.map((t) => t.name) ?? [],
    isMock: false,
  }));

  const charCount = items.reduce((sum, item) => sum + item.content.length, 0);

  return {
    connected: true,
    source: "notion",
    title: `Base Notion (${databaseId})`,
    charCount,
    sectionCount: items.length,
    error: null,
    items,
  };
}

interface NotionBlock {
  id: string;
  type: string;
  [key: string]: unknown;
}

function extractBlockText(block: NotionBlock): string {
  const richText = (block as Record<string, { rich_text?: Array<{ plain_text: string }> }>)[block.type]
    ?.rich_text;
  if (!richText) return "";
  return richText.map((t) => t.plain_text).join("");
}

async function fetchFromPage(): Promise<NotionDiagnostics> {
  const { apiKey, pageId } = getNotionConfig();
  const pageResponse = await fetch(`${NOTION_API_URL}/pages/${pageId}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Notion-Version": "2022-06-28",
    },
  });

  if (!pageResponse.ok) {
    throw new Error(`Notion API error: ${pageResponse.status} ${pageResponse.statusText}`);
  }

  const page = (await pageResponse.json()) as {
    properties?: { title?: { title?: Array<{ plain_text: string }> } };
  };
  const pageTitle = page.properties?.title?.title?.[0]?.plain_text ?? `Page Notion (${pageId})`;

  const blocksResponse = await fetch(`${NOTION_API_URL}/blocks/${pageId}/children?page_size=100`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Notion-Version": "2022-06-28",
    },
  });

  if (!blocksResponse.ok) {
    throw new Error(`Notion API error: ${blocksResponse.status} ${blocksResponse.statusText}`);
  }

  const blocksData = (await blocksResponse.json()) as { results: NotionBlock[] };
  const sections = blocksData.results.map((block) => extractBlockText(block)).filter((text) => text.length > 0);
  const content = sections.join("\n\n");

  const items: BlacklaceKnowledgeItem[] = [
    {
      id: pageId as string,
      title: pageTitle,
      universe: "Blacklace",
      content,
      tags: [],
      isMock: false,
    },
  ];

  return {
    connected: true,
    source: "notion",
    title: pageTitle,
    charCount: content.length,
    sectionCount: sections.length,
    error: null,
    items,
  };
}

export async function fetchBlacklaceKnowledgeWithDiagnostics(): Promise<NotionDiagnostics> {
  const { apiKey, databaseId, pageId } = getNotionConfig();
  if (!apiKey || (!databaseId && !pageId)) {
    logger.info("Notion API keys not set, returning mock knowledge");
    return mockDiagnostics(
      "NOTION_API_KEY et NOTION_DATABASE_ID (ou NOTION_PAGE_ID) ne sont pas configurés.",
    );
  }

  try {
    return databaseId ? await fetchFromDatabase() : await fetchFromPage();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue lors de l'appel à Notion";
    logger.error({ err }, "Notion API call failed, falling back to mock knowledge");
    return mockDiagnostics(message);
  }
}

export async function fetchBlacklaceKnowledge(): Promise<BlacklaceKnowledgeItem[]> {
  const diagnostics = await fetchBlacklaceKnowledgeWithDiagnostics();
  return diagnostics.items;
}

export function buildKnowledgeContext(items: BlacklaceKnowledgeItem[], universe: string): string {
  const relevant = items.filter((item) => item.universe.toLowerCase() === universe.toLowerCase());
  const pool = relevant.length > 0 ? relevant : items;
  return pool
    .slice(0, 3)
    .map((item) => `### ${item.title}\n${item.content}`)
    .join("\n\n");
}
