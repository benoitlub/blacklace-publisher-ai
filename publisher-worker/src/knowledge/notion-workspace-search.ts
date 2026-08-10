import type { BlacklaceKnowledgeItem } from "./notion";

const NOTION_API_URL = "https://api.notion.com/v1";
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

function headers(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
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

function propertyText(property: unknown): string {
  if (!property || typeof property !== "object") return "";
  const record = property as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "";

  if (type === "title" || Array.isArray(record.title)) return richText(record.title);
  if (type === "rich_text" || Array.isArray(record.rich_text)) return richText(record.rich_text);
  if (type === "select" && record.select && typeof record.select === "object") {
    const name = (record.select as Record<string, unknown>).name;
    return typeof name === "string" ? name : "";
  }
  if (type === "multi_select" && Array.isArray(record.multi_select)) {
    return record.multi_select.map((item) => {
      if (!item || typeof item !== "object") return "";
      const name = (item as Record<string, unknown>).name;
      return typeof name === "string" ? name : "";
    }).filter(Boolean).join(", ");
  }
  if (type === "url" && typeof record.url === "string") return record.url;
  if (type === "email" && typeof record.email === "string") return record.email;
  if (type === "phone_number" && typeof record.phone_number === "string") return record.phone_number;
  if (type === "number" && typeof record.number === "number") return String(record.number);
  if (type === "checkbox" && typeof record.checkbox === "boolean") return String(record.checkbox);
  if (type === "date" && record.date && typeof record.date === "object") {
    const date = record.date as Record<string, unknown>;
    return [date.start, date.end].filter((value): value is string => typeof value === "string").join(" — ");
  }

  return "";
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

function pageMetadata(page: NotionPageResult): { universe: string; tags: string[]; content: string } {
  const lines: string[] = [];
  const tags = new Set<string>();
  let universe = "";

  for (const [name, property] of Object.entries(page.properties ?? {})) {
    const value = propertyText(property).trim();
    if (!value) continue;

    const normalizedName = name.toLowerCase();
    if (["universe", "univers", "project", "projet", "parcel", "parcelle", "product", "produit"].includes(normalizedName)) {
      universe = value;
    }

    if (["tags", "tag", "labels", "étiquettes", "etiquettes"].includes(normalizedName)) {
      for (const tag of value.split(",").map((item) => item.trim()).filter(Boolean)) tags.add(tag);
    }

    if (!( ["name", "nom", "title", "titre"].includes(normalizedName))) {
      lines.push(`${name}: ${value}`);
    }
  }

  return { universe, tags: [...tags], content: lines.join("\n") };
}

function blockText(block: NotionBlock): string {
  const payload = block[block.type];
  if (!payload || typeof payload !== "object") return "";
  return richText((payload as Record<string, unknown>).rich_text);
}

async function readBlocks(apiKey: string, blockId: string, depth = 0): Promise<string[]> {
  if (depth > 4) return [];
  const texts: string[] = [];
  let cursor: string | undefined;
  do {
    const url = new URL(`${NOTION_API_URL}/blocks/${blockId}/children`);
    url.searchParams.set("page_size", "100");
    if (cursor) url.searchParams.set("start_cursor", cursor);
    const response = await fetch(url, { headers: headers(apiKey) });
    if (!response.ok) break;
    const payload = await response.json() as { results?: NotionBlock[]; has_more?: boolean; next_cursor?: string | null };
    for (const block of payload.results ?? []) {
      const text = blockText(block);
      if (text) texts.push(text);
      if (block.has_children) texts.push(...await readBlocks(apiKey, block.id, depth + 1));
    }
    cursor = payload.has_more && payload.next_cursor ? payload.next_cursor : undefined;
  } while (cursor);
  return texts;
}

async function searchPages(apiKey: string, query: string): Promise<NotionPageResult[]> {
  const pages: NotionPageResult[] = [];
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = {
      filter: { property: "object", value: "page" },
      sort: { direction: "descending", timestamp: "last_edited_time" },
      page_size: 100,
    };
    if (query) body.query = query;
    if (cursor) body.start_cursor = cursor;

    const response = await fetch(`${NOTION_API_URL}/search`, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify(body),
    });
    if (!response.ok) return pages;

    const payload = await response.json() as {
      results?: NotionPageResult[];
      has_more?: boolean;
      next_cursor?: string | null;
    };
    pages.push(...(payload.results ?? []).filter((item) => item.object === "page"));
    cursor = payload.has_more && payload.next_cursor ? payload.next_cursor : undefined;
  } while (cursor);

  return pages;
}

export async function searchNotionWorkspaceKnowledge(
  apiKey: string | undefined,
  query: string,
  requestedUniverse: string,
): Promise<BlacklaceKnowledgeItem[]> {
  if (!apiKey) return [];
  const normalizedQuery = query.trim();
  const normalizedUniverse = requestedUniverse.trim();
  const pages = await searchPages(apiKey, normalizedQuery);
  const items: BlacklaceKnowledgeItem[] = [];

  for (const page of pages) {
    const title = pageTitle(page);
    const metadata = pageMetadata(page);
    const blockContent = (await readBlocks(apiKey, page.id)).join("\n\n").trim();
    const content = [metadata.content, blockContent].filter(Boolean).join("\n\n").trim();
    if (!content) continue;

    items.push({
      id: page.id,
      title,
      universe: metadata.universe || normalizedUniverse,
      content,
      tags: [...new Set([...metadata.tags, normalizedUniverse, normalizedQuery, "notion-workspace"].filter(Boolean))],
      isMock: false,
    });
  }

  return items;
}
