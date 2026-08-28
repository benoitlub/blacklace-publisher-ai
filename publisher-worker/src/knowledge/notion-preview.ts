import {
  fetchBlacklaceKnowledgeWithDiagnostics,
  mockDiagnostics,
  type BlacklaceKnowledgeItem,
  type KnowledgeEnv,
  type NotionDiagnostics,
} from "./notion";

/**
 * Diagnostic de la source de connaissance pour la carte du tableau de bord.
 *
 * `fetchBlacklaceKnowledgeWithDiagnostics` exige NOTION_DATABASE_ID ou
 * NOTION_PAGE_ID. Or ce dépôt n'en a aucun : le job nocturne
 * (scripts/autonomous-knowledge-observatory.mjs) et le résolveur de Knowledge
 * Packages atteignent Notion par l'API de recherche, sans identifiant. La
 * carte annonçait donc « mock » alors que la génération de contenu, elle,
 * tourne sur du vrai Notion.
 *
 * Ce module rend compte de la source réellement utilisée : recherche si
 * aucun identifiant n'est configuré, base ou page précise sinon — de sorte
 * qu'ajouter un NOTION_DATABASE_ID plus tard bascule automatiquement sur le
 * chemin le plus précis.
 */

const NOTION_API_URL = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

/**
 * Un Worker n'a ni le budget CPU ni le budget de sous-requêtes pour parcourir
 * tout l'espace de travail : searchNotionWorkspaceKnowledge pagine sans
 * limite et lit les blocs en profondeur, ce qui convient à une mission mais
 * pas à une carte d'état. On échantillonne donc les pages les plus récemment
 * modifiées, et on ne lit qu'un niveau de blocs par page.
 */
const SAMPLE_SIZE = 10;

interface NotionSearchPage {
  object?: string;
  id: string;
  properties?: Record<string, unknown>;
}

interface NotionBlock {
  type: string;
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
  return value
    .map((item) => (item && typeof item === "object" && typeof (item as Record<string, unknown>).plain_text === "string"
      ? (item as Record<string, string>).plain_text
      : ""))
    .join("");
}

function pageTitle(page: NotionSearchPage): string {
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

async function readFirstLevelBlocks(apiKey: string, pageId: string): Promise<string> {
  const response = await fetch(`${NOTION_API_URL}/blocks/${pageId}/children?page_size=100`, {
    headers: headers(apiKey),
  });
  // Une page illisible (permissions, page vide) ne doit pas faire échouer tout
  // le diagnostic : elle compte simplement pour un contenu vide.
  if (!response.ok) return "";
  const payload = (await response.json()) as { results?: NotionBlock[] };
  return (payload.results ?? []).map(blockText).filter(Boolean).join("\n\n").trim();
}

async function searchDiagnostics(apiKey: string): Promise<NotionDiagnostics> {
  const response = await fetch(`${NOTION_API_URL}/search`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({
      filter: { property: "object", value: "page" },
      sort: { direction: "descending", timestamp: "last_edited_time" },
      page_size: SAMPLE_SIZE,
    }),
  });

  if (!response.ok) {
    throw new Error(`Notion API error: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as { results?: NotionSearchPage[] };
  const pages = (payload.results ?? []).filter((page) => page.object === undefined || page.object === "page");

  const items: BlacklaceKnowledgeItem[] = [];
  for (const page of pages) {
    items.push({
      id: page.id,
      title: pageTitle(page),
      universe: "Blacklace",
      content: await readFirstLevelBlocks(apiKey, page.id),
      tags: ["notion-workspace"],
      isMock: false,
    });
  }

  // Aucune page partagée avec l'intégration : techniquement connecté, mais
  // sans rien à lire. Le dire plutôt que d'afficher un vert trompeur.
  if (!items.length) {
    return mockDiagnostics("Le jeton Notion fonctionne, mais aucune page n'est partagée avec cette intégration.");
  }

  return {
    connected: true,
    source: "notion",
    title: `Espace de travail Notion — ${items.length} page(s) récemment modifiée(s)`,
    charCount: items.reduce((sum, item) => sum + item.content.length, 0),
    sectionCount: items.length,
    error: null,
    items,
  };
}

export async function knowledgeSourceDiagnostics(env: KnowledgeEnv): Promise<NotionDiagnostics> {
  // Un identifiant explicite reste prioritaire : il désigne une source
  // précise, la recherche n'est que le repli de ce dépôt.
  if (env.NOTION_DATABASE_ID || env.NOTION_PAGE_ID) {
    return fetchBlacklaceKnowledgeWithDiagnostics(env);
  }

  if (!env.NOTION_API_KEY) {
    return mockDiagnostics("NOTION_API_KEY n'est pas configuré dans le Worker.");
  }

  try {
    return await searchDiagnostics(env.NOTION_API_KEY);
  } catch (error) {
    return mockDiagnostics(error instanceof Error ? error.message : "Erreur inconnue lors de l'appel à Notion");
  }
}
