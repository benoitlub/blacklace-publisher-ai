import { fetchBlacklaceKnowledgeWithDiagnostics, type BlacklaceKnowledgeItem, type KnowledgeEnv } from "./notion";
import { searchNotionWorkspaceKnowledge } from "./notion-workspace-search";

export interface ResolvedKnowledgePackage {
  slug: string;
  verified: boolean;
  source: "notion" | "mock";
  items: BlacklaceKnowledgeItem[];
  prompt: string;
  diagnostics: { connected: boolean; error: string | null; totalItems: number; matchedItems: number; discoveredItems: number };
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
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " et ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").replace(/-+/g, "-");
}
function normalizedText(value: unknown): string { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " et ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " "); }
function canonicalSlug(candidates: unknown[]): string {
  const normalized = candidates.map(normalizeKnowledgeSlug).filter(Boolean);
  for (const candidate of normalized) for (const [slug, aliases] of Object.entries(KNOWN_ALIASES)) {
    const values = [slug, ...aliases.map(normalizeKnowledgeSlug)];
    if (values.some((value) => candidate === value || candidate.includes(value) || value.includes(candidate))) return slug;
  }
  return normalized[0] || "unknown";
}
function aliasesFor(slug: string): string[] { return [...new Set([normalizedText(slug), normalizedText(slug.replace(/-/g, " ")), ...(KNOWN_ALIASES[slug] ?? []).map(normalizedText)])].filter(Boolean); }
function isUsableKnowledgeItem(item: BlacklaceKnowledgeItem): boolean { return !item.isMock && Boolean(item.content.trim()); }
function countOccurrences(text: string, needle: string): number { if (!needle) return 0; let count = 0; let offset = 0; while ((offset = text.indexOf(needle, offset)) !== -1) { count += 1; offset += needle.length; } return count; }
function scoreItem(item: BlacklaceKnowledgeItem, slug: string): number {
  const aliases = aliasesFor(slug), title = normalizedText(item.title), universe = normalizedText(item.universe), tags = item.tags.map(normalizedText), content = normalizedText(item.content); let score = 0;
  for (const alias of aliases) { if (title === alias) score += 30; else if (title.includes(alias)) score += 20; if (universe === alias) score += 24; else if (universe.includes(alias)) score += 14; if (tags.some((tag) => tag === alias)) score += 18; else if (tags.some((tag) => tag.includes(alias))) score += 10; score += Math.min(countOccurrences(content, alias), 6) * 2; }
  return score;
}
function rankItems(items: BlacklaceKnowledgeItem[], slug: string): BlacklaceKnowledgeItem[] {
  const ranked = items.filter(isUsableKnowledgeItem).map((item) => ({ item, score: scoreItem(item, slug) })).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score);
  if (!ranked.length) return [];
  const bestScore = ranked[0].score, minimumScore = bestScore >= 20 ? Math.max(12, bestScore * 0.55) : bestScore;
  return ranked.filter(({ score }) => score >= minimumScore).slice(0, 5).map(({ item }) => item);
}
function buildPrompt(slug: string, items: BlacklaceKnowledgeItem[]): string {
  return ["KNOWLEDGE PACKAGE PUBLISHER VÉRIFIÉ — SOURCE DE VÉRITÉ FERMÉE", `Parcelle / produit : ${slug}`, "PÉRIMÈTRE STRICT : les seules connaissances autorisées sont les sources Notion ci-dessous.", "Ignore toute connaissance mémorisée, digérée ou provenant d'une autre parcelle, même si elle appartient au même écosystème Blacklace.", ...items.map((item, index) => [`SOURCE NOTION AUTORISÉE ${index + 1}: ${item.title}`, `Univers: ${item.universe}`, item.tags.length ? `Tags: ${item.tags.join(" | ")}` : "", item.content].filter(Boolean).join("\n")), "Utilise uniquement les faits explicitement présents dans ces sources. Si l'information nécessaire n'est pas présente, indique qu'elle est inconnue au lieu de l'inventer."].join("\n\n");
}

export async function resolveKnowledgePackage(env: KnowledgeEnv, candidates: unknown[]): Promise<ResolvedKnowledgePackage> {
  const slug = canonicalSlug(candidates);
  const diagnostics = await fetchBlacklaceKnowledgeWithDiagnostics(env);
  const allItems = diagnostics.items.filter(isUsableKnowledgeItem);
  const matchedItems = rankItems(allItems, slug);
  const discoveredItems = env.NOTION_API_KEY ? await searchNotionWorkspaceKnowledge(env.NOTION_API_KEY, slug, slug) : [];
  const combined = [...allItems, ...discoveredItems];
  const unique = [...new Map(combined.map((item) => [item.id, item])).values()];
  const selected = rankItems(unique, slug);
  const verified = diagnostics.connected && diagnostics.source === "notion" && selected.length > 0;
  return { slug, verified, source: verified ? "notion" : "mock", items: selected, prompt: verified ? buildPrompt(slug, selected) : "", diagnostics: { connected: diagnostics.connected, error: diagnostics.error, totalItems: diagnostics.items.length, matchedItems: matchedItems.length, discoveredItems: discoveredItems.length } };
}
