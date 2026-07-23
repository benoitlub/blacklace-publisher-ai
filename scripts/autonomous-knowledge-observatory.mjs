import fs from "node:fs/promises";
import path from "node:path";

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_VERSION = "2022-06-28";
const OUTPUT_DIR = path.resolve("public/knowledge-packs");

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
