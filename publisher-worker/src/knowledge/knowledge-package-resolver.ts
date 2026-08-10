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

/**
 * Contrairement au vrai Publisher (artifacts/api-server), cette version portée pour
 * Cloudflare Workers n'écrit rien dans une base de données persistante (pas de Postgres
 * disponible ici). L'apprentissage durable (digestion des sources Notion) reste exclusif
 * au cycle GitHub Actions. Cette version fait uniquement la lecture + génération en temps réel.
 */
export async function resolveKnowledgePackage(
  env: KnowledgeEnv,
  candidates: unknown[],
): Promise<ResolvedKnowledgePackage> {
  const slug = canonicalSlug(candidates);
  const diagnostics = await fetchBlacklaceKnowledgeWithDiagnostics(env);
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
  const error = verified ? null : diagnostics.error;

  return {
    slug,
    verified,
    source,
    items,
    prompt: verified ? buildPrompt(slug, items) : "",
    diagnostics: {
      connected,
      error,
      totalItems: pool.length,
      matchedItems: items.length,
      discoveredItems: discovered.size,
    },
  };
}
