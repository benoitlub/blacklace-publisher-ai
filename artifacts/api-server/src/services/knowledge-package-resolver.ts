import { fetchBlacklaceKnowledgeWithDiagnostics, type BlacklaceKnowledgeItem } from "./notion";

export interface ResolvedKnowledgePackage {
  slug: string;
  verified: boolean;
  source: "notion" | "mock";
  items: BlacklaceKnowledgeItem[];
  prompt: string;
  missingFacts: string[];
  diagnostics: {
    connected: boolean;
    error: string | null;
    totalItems: number;
    matchedItems: number;
  };
}

const KNOWN_ALIASES: Record<string, string[]> = {
  terra: ["terra"],
  "gerard-et-gerard": ["gerard et gerard", "gerard & gerard", "gerard gerard"],
  "neverland-ltd": ["neverland ltd", "neverland"],
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

function aliasesFor(slug: string): string[] {
  const aliases = new Set<string>([normalizedText(slug), normalizedText(slug.replace(/-/g, " "))]);
  for (const alias of KNOWN_ALIASES[slug] ?? []) aliases.add(normalizedText(alias));
  return [...aliases].filter(Boolean);
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
    `Client/produit/parcelle: ${slug}`,
    ...items.map((item, index) => [
      `SOURCE ${index + 1}: ${item.title}`,
      `Univers: ${item.universe}`,
      item.tags.length ? `Tags: ${item.tags.join(" | ")}` : "",
      item.content,
    ].filter(Boolean).join("\n")),
    "RÈGLE ABSOLUE: utilise uniquement les faits présents dans ce package ou explicitement fournis par l'utilisateur.",
    "RÈGLE ABSOLUE: n'invente aucun produit, prix, lien, personne, témoignage, statistique, fonctionnalité, bonus, disponibilité ou preuve.",
    "RÈGLE ABSOLUE: lorsqu'une donnée indispensable manque, retourne needs-input avec une seule question précise.",
  ].join("\n\n");
}

export async function resolveKnowledgePackage(candidates: unknown[]): Promise<ResolvedKnowledgePackage> {
  const slug = candidates.map(normalizeKnowledgeSlug).find(Boolean) || "unknown";
  const diagnostics = await fetchBlacklaceKnowledgeWithDiagnostics();
  const ranked = diagnostics.items
    .map((item) => ({ item, score: scoreItem(item, slug) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  const items = ranked.map(({ item }) => item);
  const verified = diagnostics.source === "notion" && items.length > 0 && items.every((item) => !item.isMock && Boolean(item.content.trim()));
  return {
    slug,
    verified,
    source: diagnostics.source,
    items,
    prompt: verified ? buildPrompt(slug, items) : "",
    missingFacts: verified ? [] : ["verified-client-or-product-context"],
    diagnostics: {
      connected: diagnostics.connected,
      error: diagnostics.error,
      totalItems: diagnostics.items.length,
      matchedItems: items.length,
    },
  };
}
