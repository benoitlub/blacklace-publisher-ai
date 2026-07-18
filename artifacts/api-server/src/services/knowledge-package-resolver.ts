import { fetchBlacklaceKnowledgeWithDiagnostics, type BlacklaceKnowledgeItem } from "./notion";
import { searchNotionWorkspaceKnowledge } from "./notion-workspace-search";
import { digestObservation, selectKnowledgeForMission, type KnowledgeItem } from "./knowledge-digestion";

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
    digestedItems: number;
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

function rankItems(items: BlacklaceKnowledgeItem[], slug: string): BlacklaceKnowledgeItem[] {
  return items
    .filter(isUsableKnowledgeItem)
    .map((item) => ({ item, score: scoreItem(item, slug) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(({ item }) => item);
}

function buildPrompt(slug: string, items: BlacklaceKnowledgeItem[], digested: KnowledgeItem[]): string {
  return [
    "KNOWLEDGE PACKAGE PUBLISHER VÉRIFIÉ — SOURCE DE VÉRITÉ",
    `Parcelle / produit : ${slug}`,
    ...items.map((item, index) => [
      `SOURCE NOTION ${index + 1}: ${item.title}`,
      `Univers: ${item.universe}`,
      item.tags.length ? `Tags: ${item.tags.join(" | ")}` : "",
      item.content,
    ].filter(Boolean).join("\n")),
    digested.length ? "CONNAISSANCES DIGÉRÉES ET SÉLECTIONNÉES PAR PUBLISHER" : "",
    ...digested.map((item, index) => [
      `CONNAISSANCE ${index + 1}: ${item.title}`,
      `Maturité: ${item.maturity} · Confiance: ${item.confidence}`,
      item.summary,
      item.sources.length ? `Sources: ${item.sources.map((source) => source.label).join(" | ")}` : "",
    ].filter(Boolean).join("\n")),
    "Utilise uniquement les faits présents dans ce package ou explicitement fournis dans la mission.",
    "N'invente aucun produit, prix, lien, personnage, témoignage, statistique, fonctionnalité ou preuve.",
  ].filter(Boolean).join("\n\n");
}

async function digestNotionItems(slug: string, items: BlacklaceKnowledgeItem[]): Promise<void> {
  for (const item of items) {
    await digestObservation({
      id: `notion-${item.id}`,
      title: item.title,
      summary: item.content.slice(0, 1800),
      kind: "source",
      categories: [slug, "project-knowledge"],
      expertises: ["editorial", "project-context"],
      tags: [...item.tags, slug, "notion"],
      confidence: 0.9,
      source: { label: item.title, evidence: item.content.slice(0, 500) },
      activationRules: {
        missionTypes: ["generation", "copy.generate", "content.social.write", "content.article.write", "landing.generate"],
        artifactTypes: ["markdown", "social-post", "article", "landing-page"],
        audienceTags: [slug],
        expertises: ["editorial", "project-context"],
      },
    });
  }
}

export async function resolveKnowledgePackage(candidates: unknown[]): Promise<ResolvedKnowledgePackage> {
  const slug = canonicalSlug(candidates);
  const diagnostics = await fetchBlacklaceKnowledgeWithDiagnostics();
  let pool = diagnostics.items.filter((item) => !item.isMock);
  let items = rankItems(pool, slug);
  const discovered = new Map<string, BlacklaceKnowledgeItem>();

  if (items.length === 0) {
    const targetedQueries = [...new Set([slug.replace(/-/g, " "), ...(KNOWN_ALIASES[slug] ?? [])])];

    for (const query of targetedQueries) {
      const results = await searchNotionWorkspaceKnowledge(query, slug);
      for (const item of results) discovered.set(item.id, item);
      const merged = new Map(pool.map((item) => [item.id, item]));
      for (const item of discovered.values()) merged.set(item.id, item);
      pool = [...merged.values()];
      items = rankItems(pool, slug);
      if (items.length > 0) break;
    }

    if (items.length === 0) {
      const results = await searchNotionWorkspaceKnowledge("", slug);
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

  if (verified) await digestNotionItems(slug, items);
  const digested = verified ? await selectKnowledgeForMission({
    missionType: "generation",
    audienceTags: [slug],
    expertises: ["editorial", "project-context"],
    limit: 8,
  }) : [];

  return {
    slug,
    verified,
    source,
    items,
    prompt: verified ? buildPrompt(slug, items, digested) : "",
    diagnostics: {
      connected,
      error,
      totalItems: pool.length,
      matchedItems: items.length,
      discoveredItems: discovered.size,
      digestedItems: digested.length,
    },
  };
}
