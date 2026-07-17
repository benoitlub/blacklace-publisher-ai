import type { BlacklaceKnowledgeItem } from "./notion";

const NOTION_API_URL = "https://api.notion.com/v1";
const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_VERSION = "2022-06-28";

interface NotionPageResult {
  object: "page";
  id: string;
  url?: string;
  properties?: Record<string, unknown>;
}

interface NotionBlock {
  id: string;
  type: string;
  has_children?: boolean;
  [key: string]: unknown;
}

function headers() {
  return {
    Authorization: `Bearer ${NOTION_API_KEY}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

function richText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value.map((item) => {
    if (!item || typeof item !== "object") return "";
    const record = item as Record<string, unknown>;
    return typeof record.plain_text === "string" ? record.plain_text : "";
  }).join("");
}

function pageTitle(page: NotionPageResult): string {
  for (const property of Object.values(page.properties ?? {})) {
    if (!property || typeof property !== "object") continue;
    const record = property as Record<string, unknown>;
    if (record.type === "title" || Array.isArray(record.title)) {
      const title = richText(record.title);
      if (title) return title;
    }
  }
  return "Page Notion";
}

function blockText(block: NotionBlock): string {
  const payload = block[block.type];
  if (!payload || typeof payload !== "object") return "";
  return richText((payload as Record<string, unknown>).rich_text);
}

async function readBlocks(blockId: string, depth = 0): Promise<string[]> {
  if (!NOTION_API_KEY || depth > 2) return [];
  const texts: string[] = [];
  let cursor: string | undefined;
  do {
    const url = new URL(`${NOTION_API_URL}/blocks/${blockId}/children`);
    url.searchParams.set("page_size", "100");
    if (cursor) url.searchParams.set("start_cursor", cursor);
    const response = await fetch(url, { headers: headers() });
    if (!response.ok) break;
    const payload = await response.json() as { results?: NotionBlock[]; has_more?: boolean; next_cursor?: string | null };
    for (const block of payload.results ?? []) {
      const text = blockText(block);
      if (text) texts.push(text);
      if (block.has_children) texts.push(...await readBlocks(block.id, depth + 1));
    }
    cursor = payload.has_more && payload.next_cursor ? payload.next_cursor : undefined;
  } while (cursor);
  return texts;
}

export async function searchNotionWorkspaceKnowledge(query: string, universe: string): Promise<BlacklaceKnowledgeItem[]> {
  if (!NOTION_API_KEY || !query.trim()) return [];
  const response = await fetch(`${NOTION_API_URL}/search`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      query: query.trim(),
      filter: { property: "object", value: "page" },
      sort: { direction: "descending", timestamp: "last_edited_time" },
      page_size: 20,
    }),
  });
  if (!response.ok) return [];
  const payload = await response.json() as { results?: NotionPageResult[] };
  const items: BlacklaceKnowledgeItem[] = [];
  for (const page of payload.results ?? []) {
    const title = pageTitle(page);
    const content = (await readBlocks(page.id)).join("\n\n").trim();
    if (!content) continue;
    items.push({
      id: page.id,
      title,
      universe,
      content,
      tags: [universe, query, "notion-workspace"],
      isMock: false,
    });
  }
  return items;
}
