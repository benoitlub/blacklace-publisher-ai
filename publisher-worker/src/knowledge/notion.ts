// Reçoit des chaînes déjà résolues (le Worker gère la résolution des secrets
// -- string simple ou Secrets Store binding -- avant d'appeler ce module).
export interface KnowledgeEnv {
  NOTION_API_KEY?: string;
  NOTION_DATABASE_ID?: string;
  NOTION_PAGE_ID?: string;
}

const NOTION_API_URL = "https://api.notion.com/v1";

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
];

function mockDiagnostics(error: string | null = null): NotionDiagnostics {
  const charCount = MOCK_KNOWLEDGE.reduce((sum, item) => sum + item.content.length, 0);
  return {
    connected: false,
    source: "mock",
    title: "Base de connaissances simulée (indisponible)",
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

async function fetchFromDatabase(env: KnowledgeEnv, apiKey: string): Promise<NotionDiagnostics> {
  const response = await fetch(`${NOTION_API_URL}/databases/${env.NOTION_DATABASE_ID}/query`, {
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
    title: `Base Notion (${env.NOTION_DATABASE_ID})`,
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

async function fetchFromPage(env: KnowledgeEnv, apiKey: string): Promise<NotionDiagnostics> {
  const pageId = env.NOTION_PAGE_ID;
  const pageResponse = await fetch(`${NOTION_API_URL}/pages/${pageId}`, {
    headers: { Authorization: `Bearer ${apiKey}`, "Notion-Version": "2022-06-28" },
  });

  if (!pageResponse.ok) {
    throw new Error(`Notion API error: ${pageResponse.status} ${pageResponse.statusText}`);
  }

  const page = (await pageResponse.json()) as {
    properties?: { title?: { title?: Array<{ plain_text: string }> } };
  };
  const pageTitle = page.properties?.title?.title?.[0]?.plain_text ?? `Page Notion (${pageId})`;

  const blocksResponse = await fetch(`${NOTION_API_URL}/blocks/${pageId}/children?page_size=100`, {
    headers: { Authorization: `Bearer ${apiKey}`, "Notion-Version": "2022-06-28" },
  });

  if (!blocksResponse.ok) {
    throw new Error(`Notion API error: ${blocksResponse.status} ${blocksResponse.statusText}`);
  }

  const blocksData = (await blocksResponse.json()) as { results: NotionBlock[] };
  const sections = blocksData.results.map((block) => extractBlockText(block)).filter((text) => text.length > 0);
  const content = sections.join("\n\n");

  const items: BlacklaceKnowledgeItem[] = [
    { id: pageId as string, title: pageTitle, universe: "Blacklace", content, tags: [], isMock: false },
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

export async function fetchBlacklaceKnowledgeWithDiagnostics(env: KnowledgeEnv): Promise<NotionDiagnostics> {
  const apiKey = env.NOTION_API_KEY;
  if (!apiKey || (!env.NOTION_DATABASE_ID && !env.NOTION_PAGE_ID)) {
    return mockDiagnostics("NOTION_API_KEY et NOTION_DATABASE_ID (ou NOTION_PAGE_ID) ne sont pas configurés.");
  }

  try {
    return env.NOTION_DATABASE_ID ? await fetchFromDatabase(env, apiKey) : await fetchFromPage(env, apiKey);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue lors de l'appel à Notion";
    return mockDiagnostics(message);
  }
}
