import { logger } from "../lib/logger";

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
const NOTION_API_URL = "https://api.notion.com/v1";

export interface BlacklaceKnowledgeItem {
  id: string;
  title: string;
  universe: string;
  content: string;
  tags: string[];
  isMock: boolean;
}

export interface NotionKnowledgeResult {
  items: BlacklaceKnowledgeItem[];
  isMock: boolean;
  isConfigured: boolean;
  error?: string;
}

const MOCK_KNOWLEDGE: BlacklaceKnowledgeItem[] = [
  {
    id: "mock-1",
    title: "Blacklace — Bible narrative",
    universe: "Blacklace",
    content: "Blacklace est un univers de science-fiction absurde où des entités non-humaines observent les comportements des bipèdes avec une curiosité mêlée de scepticisme bienveillant.",
    tags: ["bible", "univers", "blacklace"],
    isMock: true,
  },
  {
    id: "mock-2",
    title: "Creature-Sync — Protocole d'observation",
    universe: "Creature-Sync",
    content: "Creature-Sync est un protocole de science participative permettant l'observation et la documentation des espèces sauvages via une application mobile et des agents IA naturalistes.",
    tags: ["creature-sync", "science", "nature"],
    isMock: true,
  },
  {
    id: "mock-3",
    title: "Kif & Molla — Présentation des personnages",
    universe: "Kif & Molla",
    content: "Kif et Molla sont deux personnages complémentaires dont les aventures explorent les thèmes de l'amitié, de la différence et de l'absurde du quotidien à travers des épisodes illustrés.",
    tags: ["kif-molla", "personnages", "bande-dessinée"],
    isMock: true,
  },
  {
    id: "mock-4",
    title: "TERRA — Citations cosmiques",
    universe: "TERRA",
    content: "TERRA est un projet de citations philosophiques et poétiques ancrées dans une cosmologie fictive. Chaque citation est attribuée à un penseur imaginaire de civilisations lointaines.",
    tags: ["terra", "philosophie", "poésie"],
    isMock: true,
  },
  {
    id: "mock-5",
    title: "Pro.Hibited — Concept éditorial",
    universe: "Pro.Hibited",
    content: "Pro.Hibited Online est un espace éditorial explorant les zones grises de la création : contenus non conventionnels, formats hybrides, expériences narratives limites.",
    tags: ["pro-hibited", "editorial", "expérimental"],
    isMock: true,
  },
];

function getConfigurationError(): string | undefined {
  if (!NOTION_API_KEY && !NOTION_DATABASE_ID) return "NOTION_API_KEY et NOTION_DATABASE_ID manquent dans Render.";
  if (!NOTION_API_KEY) return "NOTION_API_KEY manque dans Render.";
  if (!NOTION_DATABASE_ID) return "NOTION_DATABASE_ID manque dans Render.";
  return undefined;
}

function mapNotionPage(page: {
  id: string;
  properties: {
    Name?: { title: Array<{ plain_text: string }> };
    Universe?: { select?: { name: string } };
    Content?: { rich_text: Array<{ plain_text: string }> };
    Tags?: { multi_select: Array<{ name: string }> };
  };
}): BlacklaceKnowledgeItem {
  return {
    id: page.id,
    title: page.properties.Name?.title?.[0]?.plain_text ?? "Sans titre",
    universe: page.properties.Universe?.select?.name ?? "Blacklace",
    content: page.properties.Content?.rich_text?.[0]?.plain_text ?? "",
    tags: page.properties.Tags?.multi_select?.map((t) => t.name) ?? [],
    isMock: false,
  };
}

export async function fetchBlacklaceKnowledgeWithDiagnostics(): Promise<NotionKnowledgeResult> {
  const configurationError = getConfigurationError();
  if (configurationError) {
    logger.info({ configurationError }, "Notion API keys not set, returning mock knowledge");
    return { items: MOCK_KNOWLEDGE, isMock: true, isConfigured: false, error: configurationError };
  }

  try {
    const response = await fetch(`${NOTION_API_URL}/databases/${NOTION_DATABASE_ID}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NOTION_API_KEY}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ page_size: 100 }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Notion API error ${response.status}: ${body.slice(0, 400)}`);
    }

    const data = (await response.json()) as {
      results: Array<{
        id: string;
        properties: {
          Name?: { title: Array<{ plain_text: string }> };
          Universe?: { select?: { name: string } };
          Content?: { rich_text: Array<{ plain_text: string }> };
          Tags?: { multi_select: Array<{ name: string }> };
        };
      }>;
    };

    return { items: data.results.map(mapNotionPage), isMock: false, isConfigured: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur Notion inconnue.";
    logger.error({ err }, "Notion API call failed, falling back to mock knowledge");
    return { items: MOCK_KNOWLEDGE, isMock: true, isConfigured: true, error: message };
  }
}

export async function fetchBlacklaceKnowledge(): Promise<BlacklaceKnowledgeItem[]> {
  const result = await fetchBlacklaceKnowledgeWithDiagnostics();
  return result.items;
}
