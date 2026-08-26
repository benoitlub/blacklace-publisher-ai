import fs from "node:fs/promises";
import path from "node:path";

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_VERSION = "2022-06-28";
const OUTPUT_DIR = path.resolve("public/knowledge-packs");

// Le Worker Cloudflare est le seul backend déployé à parler à Neon. Ce job
// tourne sans `pnpm install` (voir le workflow), donc il l'interroge en HTTP
// plutôt que d'ouvrir une connexion Postgres.
const PUBLISHER_API_URL = (process.env.PUBLISHER_API_URL
  || "https://blacklace-publisher-worker.benoitlubert.workers.dev").replace(/\/$/, "");
const USER_SOURCES_SLUG = "observatory-user-sources";

const PARCELS = [
  ["terra", ["terra"]],
  ["gerard-et-gerard", ["gérard et gérard", "gerard et gerard", "gerard & gerard"]],
  ["neverland-ltd", ["neverland ltd", "neverland"]],
  ["la-feulette-tachetee", ["la feulette tachetée", "feulette tachetée"]],
  ["420-dice", ["420 dice", "420 dice game"]],
  ["pro-hibited-online", ["pro.hibited online", "prohibited online"]],
  ["blacklace-dice", ["blacklace dice"]],
  ["creature-sync", ["creature-sync", "creature sync"]],
  ["feuch-institute", ["feuch institute"]],
  ["bazar-du-feuch", ["bazar du feuch"]],
  ["poulpe-fiction", ["poulpe fiction"]],
];

function notionHeaders() {
  return {
    Authorization: `Bearer ${NOTION_API_KEY}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

function richText(value) {
  if (!Array.isArray(value)) return "";
  return value.map((item) => item?.plain_text || "").join("");
}

function pageTitle(page) {
  for (const property of Object.values(page.properties || {})) {
    if (property?.type === "title" || Array.isArray(property?.title)) {
      const title = richText(property.title);
      if (title) return title;
    }
  }
  return "Page Notion";
}

function blockText(block) {
  const payload = block?.[block?.type];
  return payload ? richText(payload.rich_text) : "";
}

async function readBlocks(blockId, depth = 0) {
  if (depth > 2) return [];
  const texts = [];
  let cursor;

  do {
    const url = new URL(`https://api.notion.com/v1/blocks/${blockId}/children`);
    url.searchParams.set("page_size", "100");
    if (cursor) url.searchParams.set("start_cursor", cursor);

    const response = await fetch(url, { headers: notionHeaders() });
    if (!response.ok) {
      throw new Error(`Notion blocks read failed (${response.status}) for ${blockId}`);
    }

    const payload = await response.json();
    for (const block of payload.results || []) {
      const text = blockText(block);
      if (text) texts.push(text);
      if (block.has_children) texts.push(...await readBlocks(block.id, depth + 1));
    }
    cursor = payload.has_more ? payload.next_cursor : undefined;
  } while (cursor);

  return texts;
}

async function searchPages(query) {
  const response = await fetch("https://api.notion.com/v1/search", {
    method: "POST",
    headers: notionHeaders(),
    body: JSON.stringify({
      query,
      filter: { property: "object", value: "page" },
      sort: { direction: "descending", timestamp: "last_edited_time" },
      page_size: 20,
    }),
  });

  if (!response.ok) throw new Error(`Notion search failed (${response.status})`);
  return (await response.json()).results || [];
}

async function buildPack(slug, aliases) {
  const pages = new Map();
  for (const alias of aliases) {
    for (const page of await searchPages(alias)) pages.set(page.id, page);
    if (pages.size >= 10) break;
  }

  const sources = [];
  for (const page of [...pages.values()].slice(0, 10)) {
    const content = (await readBlocks(page.id)).join("\n\n").trim();
    if (!content) continue;
    sources.push({
      id: page.id,
      title: pageTitle(page),
      url: page.url || null,
      content,
      capturedAt: new Date().toISOString(),
    });
  }

  return {
    version: 1,
    slug,
    status: sources.length ? "verified" : "empty",
    source: "notion-autonomous-observatory",
    aliases,
    sources,
    sourceCount: sources.length,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Sources ajoutées à la main depuis l'Observatoire du dashboard.
 *
 * Elles vivaient auparavant uniquement dans le localStorage du navigateur :
 * ce job n'en voyait aucune, d'où un tableau de bord bloqué à 0 et des
 * sources jamais traitées. Elles sont désormais persistées dans Neon par le
 * Worker, et c'est cette file (`status=pending`) que l'on vide ici.
 */
async function fetchPendingUserSources() {
  const response = await fetch(`${PUBLISHER_API_URL}/api/observatory/sources?status=pending&limit=200`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Publisher API returned HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.configured === false) throw new Error("Publisher n'a pas de base Neon configurée.");
  return Array.isArray(payload.sources) ? payload.sources : [];
}

async function markUserSourcesProcessed(ids) {
  if (!ids.length) return;
  const response = await fetch(`${PUBLISHER_API_URL}/api/observatory/sources/mark-processed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`mark-processed returned HTTP ${response.status}`);
}

function userSourcesPack(sources) {
  return {
    version: 1,
    slug: USER_SOURCES_SLUG,
    status: sources.length ? "verified" : "empty",
    source: "publisher-observatory-user-sources",
    aliases: [],
    sources: sources.map((source) => ({
      id: source.id,
      title: source.name,
      url: source.kind === "url" || source.kind === "github" ? source.value : null,
      content: [
        source.summary,
        Array.isArray(source.pack?.patterns) && source.pack.patterns.length
          ? `Patterns : ${source.pack.patterns.join(", ")}`
          : "",
        Array.isArray(source.pack?.recommendations) && source.pack.recommendations.length
          ? `Recommandations : ${source.pack.recommendations.join(", ")}`
          : "",
      ].filter(Boolean).join("\n\n") || source.value,
      capturedAt: source.lastObservedAt,
      kind: source.kind,
      decision: source.decision,
      tags: source.tags ?? [],
      octopus: source.octopus ?? null,
    })),
    sourceCount: sources.length,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Volontairement isolé du pipeline Notion ci-dessus : une API Publisher
 * injoignable ne doit jamais faire échouer le rafraîchissement des packs
 * existants (Bazar du Feuch & co.).
 */
async function refreshUserSourcesPack() {
  try {
    const sources = await fetchPendingUserSources();
    const pack = userSourcesPack(sources);
    await fs.writeFile(
      path.join(OUTPUT_DIR, `${USER_SOURCES_SLUG}.json`),
      `${JSON.stringify(pack, null, 2)}\n`,
      "utf8",
    );
    await markUserSourcesProcessed(sources.map((source) => source.id));
    console.log(`${USER_SOURCES_SLUG}: ${sources.length} source(s) utilisateur traitée(s)`);
    return { slug: USER_SOURCES_SLUG, status: pack.status, sourceCount: pack.sourceCount, generatedAt: pack.generatedAt };
  } catch (error) {
    console.warn(`${USER_SOURCES_SLUG}: sources utilisateur non lues (${error.message})`);
    return null;
  }
}

async function main() {
  if (!NOTION_API_KEY) {
    throw new Error("NOTION_API_KEY is required for the autonomous observatory");
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const index = [];

  for (const [slug, aliases] of PARCELS) {
    const pack = await buildPack(slug, aliases);
    await fs.writeFile(
      path.join(OUTPUT_DIR, `${slug}.json`),
      `${JSON.stringify(pack, null, 2)}\n`,
      "utf8",
    );
    index.push({
      slug,
      status: pack.status,
      sourceCount: pack.sourceCount,
      generatedAt: pack.generatedAt,
    });
    console.log(`${slug}: ${pack.sourceCount} source(s)`);
  }

  const userSourcesEntry = await refreshUserSourcesPack();
  if (userSourcesEntry) index.push(userSourcesEntry);

  await fs.writeFile(
    path.join(OUTPUT_DIR, "index.json"),
    `${JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), packs: index }, null, 2)}\n`,
    "utf8",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
