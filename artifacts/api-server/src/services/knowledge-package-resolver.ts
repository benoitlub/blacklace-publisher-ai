import { fetchBlacklaceKnowledgeWithDiagnostics, type BlacklaceKnowledgeItem } from "./notion";

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
  };
}

const KNOWN_ALIASES: Record<string, string[]> = {
  terra: ["terra"],
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

function scoreItem(item: BlacklaceKnowledgeItem, slug: string): number {
  const aliases = aliasesFor(slug);
  const title = normalizedText(item.title);
  const universe = normalizedText(item.universe);
  const tags = item.tags.map(normalizedText);
  const content = normalizedText(item.content);
  let score = 0;
  for (const alias of aliases) {
    if (title === alias) score += 20;
    else if (title.includes(alias)) score += 12;
    if (universe === alias) score += 16;
    else if (universe.includes(alias)) score += 8;
    if (tags.some((tag) => tag === alias)) score += 10;
    else if (tags.some((tag) => tag.includes(alias))) score += 5;
    if (content.includes(alias)) score += 2;
  }
  return score;
}

function buildPrompt(slug: string, items: BlacklaceKnowledgeItem[]): string {
  return [
    "KNOWLEDGE PACKAGE PUBLISHER VÉRIFIÉ — SOURCE DE VÉRITÉ",
    `Parcelle / produit : ${slug}`,
    ...items.map((item, index) => [
      `SOURCE ${index + 1}: ${item.title}`,
      `Univers: ${item.universe}`,
      item.tags.length ? `Tags: ${item.tags.join(" | ")}` : "",
      item.content,
    ].filter(Boolean).join("\n")),
    "Utilise uniquement les faits présents dans ce package ou explicitement fournis dans la mission.",
    "N'invente aucun produit, prix, lien, personnage, témoignage, statistique, fonctionnalité ou preuve.",
  ].join("\n\n");
}

export async function resolveKnowledgePackage(candidates: unknown[]): Promise<ResolvedKnowledgePackage> {
  const slug = canonicalSlug(candidates);
  const diagnostics = await fetchBlacklaceKnowledgeWithDiagnostics();
  const ranked = diagnostics.items
    .map((item) => ({ item, score: scoreItem(item, slug) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  const items = ranked.map(({ item }) => item);
  const verified = diagnostics.source === "notion" && items.length > 0 && items.every((item) => !item.isMock && Boolean(item.content.trim()));
  return {
    slug,
    verified,
    source: diagnostics.source,
    items,
    prompt: verified ? buildPrompt(slug, items) : "",
    diagnostics: {
      connected: diagnostics.connected,
      error: diagnostics.error,
      totalItems: diagnostics.items.length,
      matchedItems: items.length,
    },
  };
}
