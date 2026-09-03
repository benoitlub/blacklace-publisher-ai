import { fetchBlacklaceKnowledgeWithDiagnostics, type BlacklaceKnowledgeItem, type KnowledgeEnv } from "./notion";
import { searchNotionWorkspaceKnowledge } from "./notion-workspace-search";

export interface ResolvedKnowledgePackage {
  slug: string;
  verified: boolean;
  source: "notion" | "mock";
  items: BlacklaceKnowledgeItem[];
  prompt: string;
  diagnostics: {
    connected: boolean;
    error: string | null;
    totalItems: number;
    matchedItems: number;
    discoveredItems: number;
    committedPack?: {
      attempted: boolean;
      url: string;
      httpStatus: number | null;
      error: string | null;
      status?: string | null;
      slug?: string | null;
      sourceCount?: number;
    };
  };
}

const KNOWN_ALIASES: Record<string, string[]> = {
  terra: ["terra"],
  "gerard-et-gerard": ["gerard et gerard", "gerard & gerard", "gerard gerard", "gérard et gérard", "gérard & gérard"],
  "neverland-ltd": ["neverland ltd", "neverland", "peter pan"],
  "la-feulette-tachetee": ["la feulette tachetee", "feulette tachetee"],
  "420-dice": ["420 dice", "420 dice game"],
  "pro-hibited-online": ["pro hibited online", "prohibited online", "pro hibited"],
  "blacklace-dice": ["blacklace dice"],
  "creature-sync": ["creature sync", "creature-sync"],
  "feuch-institute": ["feuch institute"],
  "bazar-du-feuch": ["bazar du feuch"],
  "poulpe-fiction": ["poulpe fiction"],
  "yael-prequalification-de-prospects": [
    "yaelbali",
    "yael bali",
    "financement immobilier",
    "capacite d'emprunt",
    "courtage financement",
    "montigny-le-bretonneux",
  ],
};

export function normalizeKnowledgeSlug(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " et ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .replace(/-+/g, "-");
}

function normalizedText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " et ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function canonicalSlug(candidates: unknown[]): string {
  const normalized = candidates.map(normalizeKnowledgeSlug).filter(Boolean);
  for (const candidate of normalized) {
    for (const [slug, aliases] of Object.entries(KNOWN_ALIASES)) {
      const values = [slug, ...aliases.map(normalizeKnowledgeSlug)];
      if (values.some((value) => candidate === value || candidate.includes(value) || value.includes(candidate))) return slug;
    }
  }
  return normalized[0] || "unknown";
}

function aliasesFor(slug: string): string[] {
  return [...new Set([
    normalizedText(slug),
    normalizedText(slug.replace(/-/g, " ")),
    ...(KNOWN_ALIASES[slug] ?? []).map(normalizedText),
  ])].filter(Boolean);
}

function isUsableKnowledgeItem(item: BlacklaceKnowledgeItem): boolean {
  return !item.isMock && Boolean(item.content.trim());
}

function countOccurrences(text: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  while ((offset = text.indexOf(needle, offset)) !== -1) {
    count += 1;
    offset += needle.length;
  }
  return count;
}

function scoreItem(item: BlacklaceKnowledgeItem, slug: string): number {
  const aliases = aliasesFor(slug);
  const title = normalizedText(item.title);
  const universe = normalizedText(item.universe);
  const tags = item.tags.map(normalizedText);
  const content = normalizedText(item.content);
  let score = 0;

  for (const alias of aliases) {
    if (title === alias) score += 30;
    else if (title.includes(alias)) score += 20;
    if (universe === alias) score += 24;
    else if (universe.includes(alias)) score += 14;
    if (tags.some((tag) => tag === alias)) score += 18;
    else if (tags.some((tag) => tag.includes(alias))) score += 10;

    const occurrences = countOccurrences(content, alias);
    score += Math.min(occurrences, 6) * 2;
  }

  return score;
}

function rankItems(items: BlacklaceKnowledgeItem[], slug: string): BlacklaceKnowledgeItem[] {
  const ranked = items
    .filter(isUsableKnowledgeItem)
    .map((item) => ({ item, score: scoreItem(item, slug) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) return [];

  const bestScore = ranked[0].score;
  const minimumScore = bestScore >= 20 ? Math.max(12, bestScore * 0.55) : bestScore;

  return ranked
    .filter(({ score }) => score >= minimumScore)
    .slice(0, 5)
    .map(({ item }) => item);
}

function buildPrompt(slug: string, items: BlacklaceKnowledgeItem[]): string {
  return [
    "KNOWLEDGE PACKAGE PUBLISHER VÉRIFIÉ — SOURCE DE VÉRITÉ FERMÉE",
    `Parcelle / produit : ${slug}`,
    "PÉRIMÈTRE STRICT : les seules connaissances autorisées sont les sources Notion ci-dessous.",
    "Ignore toute connaissance mémorisée, digérée ou provenant d'une autre parcelle, même si elle appartient au même écosystème Blacklace.",
    ...items.map((item, index) => [
      `SOURCE NOTION AUTORISÉE ${index + 1}: ${item.title}`,
      `Univers: ${item.universe}`,
      item.tags.length ? `Tags: ${item.tags.join(" | ")}` : "",
      item.content,
    ].filter(Boolean).join("\n")),
    "Utilise uniquement les faits explicitement présents dans ces sources ou fournis dans la mission.",
    "N'ajoute aucune relation transmedia ou inter-univers qui ne soit pas explicitement écrite dans ces sources.",
    "N'invente aucun produit, prix, disponibilité, lien, personnage, espèce, citation, témoignage, statistique, fonctionnalité ou preuve.",
    "Quand une information manque, omets-la. Ne la complète pas par vraisemblance.",
  ].filter(Boolean).join("\n\n");
}

interface CommittedKnowledgePackSource {
  id: string;
  title: string;
  content: string;
  url?: string | null;
}

interface CommittedKnowledgePack {
  slug: string;
  status: string;
  source: string;
  sources: CommittedKnowledgePackSource[];
  sourceCount: number;
}

async function fetchCommittedKnowledgePack(
  slug: string,
): Promise<{ items: BlacklaceKnowledgeItem[]; diagnostics: NonNullable<ResolvedKnowledgePackage["diagnostics"]["committedPack"]> }> {
  const url = `https://raw.githubusercontent.com/benoitlub/blacklace-publisher-ai/main/public/knowledge-packs/${encodeURIComponent(slug)}.json`;
  const base = { attempted: true, url, httpStatus: null as number | null, error: null as string | null, status: null as string | null, slug: null as string | null, sourceCount: 0 };
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    base.httpStatus = response.status;
    if (!response.ok) {
      base.error = `Knowledge pack fetch failed: HTTP ${response.status}`;
      return { items: [], diagnostics: base };
    }
    const pack = await response.json() as Partial<CommittedKnowledgePack>;
    base.status = typeof pack.status === "string" ? pack.status : null;
    base.slug = typeof pack.slug === "string" ? pack.slug : null;
    base.sourceCount = typeof pack.sourceCount === "number" ? pack.sourceCount : Array.isArray(pack.sources) ? pack.sources.length : 0;
    if (pack.slug !== slug || pack.status !== "verified" || !Array.isArray(pack.sources)) {
      base.error = `Invalid knowledge pack: slug=${String(pack.slug)} status=${String(pack.status)} sources=${Array.isArray(pack.sources)}`;
      return { items: [], diagnostics: base };
    }
    return {
      diagnostics: base,
      items: pack.sources
        .filter((source): source is CommittedKnowledgePackSource => Boolean(source?.id && source?.title && source?.content?.trim()))
        .map((source) => ({
          id: `knowledge-pack:${source.id}`,
          title: source.title,
          content: source.content.trim(),
          universe: slug,
          tags: [slug, "knowledge-pack", "notion"],
          isMock: false,
          source: source.url || "notion-autonomous-observatory",
        } as BlacklaceKnowledgeItem)),
    };
  } catch (error) {
    base.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return { items: [], diagnostics: base };
  }
}

export async function resolveKnowledgePackage(
  env: KnowledgeEnv,
  candidates: unknown[],
): Promise<ResolvedKnowledgePackage> {
  const slug = canonicalSlug(candidates);
  const diagnostics = await fetchBlacklaceKnowledgeWithDiagnostics(env);
  const committed = await fetchCommittedKnowledgePack(slug);
  const committedItems = committed.items;
  if (committedItems.length > 0) {
    const items = rankItems(committedItems, slug);
    if (items.length > 0) {
      return {
        slug,
        verified: true,
        source: "notion",
        items,
        prompt: buildPrompt(slug, items),
        diagnostics: { connected: true, error: null, totalItems: committedItems.length, matchedItems: items.length, discoveredItems: committedItems.length, committedPack: committed.diagnostics },
      };
    }
  }

  let pool = diagnostics.items.filter((item) => !item.isMock);
  let items = rankItems(pool, slug);
  const discovered = new Map<string, BlacklaceKnowledgeItem>();
  const apiKey = env.NOTION_API_KEY;

  if (items.length < 2) {
    const targetedQueries = [...new Set([slug.replace(/-/g, " "), ...(KNOWN_ALIASES[slug] ?? [])])];
    for (const query of targetedQueries) {
      const results = await searchNotionWorkspaceKnowledge(apiKey, query, slug);
      for (const item of results) discovered.set(item.id, item);
      const merged = new Map(pool.map((item) => [item.id, item]));
      for (const item of discovered.values()) merged.set(item.id, item);
      pool = [...merged.values()];
      items = rankItems(pool, slug);
      if (items.length > 0) break;
    }
    if (items.length === 0) {
      const results = await searchNotionWorkspaceKnowledge(apiKey, "", slug);
      for (const item of results) discovered.set(item.id, item);
      const merged = new Map(pool.map((item) => [item.id, item]));
      for (const item of discovered.values()) merged.set(item.id, item);
      pool = [...merged.values()];
      items = rankItems(pool, slug);
    }
  }

  const verified = items.length > 0 && items.every(isUsableKnowledgeItem);
  const source: "notion" | "mock" = verified ? "notion" : diagnostics.source;
  const connected = diagnostics.connected || discovered.size > 0;
  const error = verified ? null : diagnostics.error || committed.diagnostics.error;

  return {
    slug,
    verified,
    source,
    items,
    prompt: verified ? buildPrompt(slug, items) : "",
    diagnostics: { connected, error, totalItems: pool.length, matchedItems: items.length, discoveredItems: discovered.size, committedPack: committed.diagnostics },
  };
}
