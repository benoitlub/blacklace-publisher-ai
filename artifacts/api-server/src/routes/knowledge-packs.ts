import { Router } from "express";
import {
  fetchBlacklaceKnowledgeWithDiagnostics,
  type BlacklaceKnowledgeItem,
} from "../services/notion";

const router = Router();

router.get("/:slug", async (req, res) => {
  const slug = normalize(req.params.slug);
  if (!slug) return res.status(400).json({ error: "Knowledge Pack slug is required" });

  const diagnostics = await fetchBlacklaceKnowledgeWithDiagnostics();
  const ranked = diagnostics.items
    .map((item) => ({ item, score: scoreItem(item, slug) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const items = ranked.map(({ item }) => item);
  const verified = diagnostics.source === "notion" && items.length > 0 && items.every((item) => !item.isMock);

  return res.json({
    version: 1,
    slug,
    verified,
    source: diagnostics.source,
    sourceTitle: diagnostics.title,
    fetchedAt: new Date().toISOString(),
    items,
    prompt: buildPackPrompt(slug, items, verified),
    diagnostics: {
      connected: diagnostics.connected,
      error: diagnostics.error,
      totalItems: diagnostics.items.length,
      matchedItems: items.length,
    },
  });
});

function scoreItem(item: BlacklaceKnowledgeItem, slug: string): number {
  const aliases = aliasesFor(slug);
  const title = normalize(item.title);
  const universe = normalize(item.universe);
  const tags = item.tags.map(normalize);
  const content = normalize(item.content);
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

function aliasesFor(slug: string): string[] {
  const aliases = new Set([slug, slug.replace(/-/g, " ")]);
  const known: Record<string, string[]> = {
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
  for (const value of known[slug] ?? []) aliases.add(normalize(value));
  return [...aliases].filter(Boolean);
}

function buildPackPrompt(slug: string, items: BlacklaceKnowledgeItem[], verified: boolean): string {
  if (!verified || items.length === 0) return "";
  return [
    "KNOWLEDGE PACK PUBLISHER VÉRIFIÉ — SOURCE DE VÉRITÉ",
    `Produit/Seed: ${slug}`,
    ...items.map((item, index) => [
      `SOURCE ${index + 1}: ${item.title}`,
      `Univers: ${item.universe}`,
      item.tags.length ? `Tags: ${item.tags.join(" | ")}` : "",
      item.content,
    ].filter(Boolean).join("\n")),
    "RÈGLE: utilise uniquement les faits présents dans ce pack ou explicitement fournis par l'utilisateur.",
    "RÈGLE: n'invente aucun chiffre, lien, témoignage, offre, urgence, extrait, partenaire ou caractéristique.",
    "RÈGLE: lorsqu'une information manque, pose une question explicite au lieu de la compléter.",
  ].join("\n\n");
}

function normalize(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " et ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export default router;
