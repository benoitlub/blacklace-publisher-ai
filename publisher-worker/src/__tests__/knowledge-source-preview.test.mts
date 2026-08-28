/**
 * La carte « Source de connaissance » lit un schéma précis
 * (KnowledgeSourcePreview, lib/api-spec/openapi.yaml). Ces cas verrouillent la
 * mise en forme : c'est tout ce que la route fait en propre.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { knowledgeSourcePreview } from "../worker.ts";
import { fetchBlacklaceKnowledgeWithDiagnostics } from "../knowledge/notion.ts";
import { knowledgeSourceDiagnostics } from "../knowledge/notion-preview.ts";

function item(id: string, content = "contenu") {
  return { id, title: `Titre ${id}`, universe: "Blacklace", content, tags: [], isMock: false };
}

test("expose exactement les champs attendus par la carte", () => {
  const preview = knowledgeSourcePreview({
    connected: true,
    source: "notion",
    title: "Base Notion (abc)",
    charCount: 42,
    sectionCount: 2,
    error: null,
    items: [item("a"), item("b")],
  });

  assert.deepEqual(Object.keys(preview).sort(), ["charCount", "connected", "error", "items", "sectionCount", "source", "title"]);
  assert.deepEqual(Object.keys(preview.items[0]).sort(), ["excerpt", "id", "isMock", "title", "universe"]);
  assert.equal(preview.connected, true);
  assert.equal(preview.source, "notion");
});

test("tronque l'extrait à 200 caractères et plafonne la liste à 10 entrées", () => {
  const long = "x".repeat(500);
  const preview = knowledgeSourcePreview({
    connected: true,
    source: "notion",
    title: "Base Notion",
    charCount: long.length * 12,
    sectionCount: 12,
    error: null,
    items: Array.from({ length: 12 }, (_, index) => item(`item-${index}`, long)),
  });

  assert.equal(preview.items.length, 10);
  assert.equal(preview.items[0].excerpt.length, 200);
  // sectionCount reste le vrai total, il ne suit pas la troncature d'affichage.
  assert.equal(preview.sectionCount, 12);
});

test("sans clé Notion, répond en mock avec la raison — jamais une exception", async () => {
  const preview = knowledgeSourcePreview(await fetchBlacklaceKnowledgeWithDiagnostics({}));

  assert.equal(preview.connected, false);
  assert.equal(preview.source, "mock");
  assert.match(preview.error ?? "", /NOTION_API_KEY/);
  assert.ok(preview.items.length > 0);
  assert.ok(preview.items.every((entry) => entry.isMock));
});

test("une erreur de l'API Notion redescend en mock, sans faire échouer la route", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("nope", { status: 401, statusText: "Unauthorized" })) as typeof fetch;
  try {
    const preview = knowledgeSourcePreview(
      await fetchBlacklaceKnowledgeWithDiagnostics({ NOTION_API_KEY: "clé-invalide", NOTION_DATABASE_ID: "db" }),
    );
    assert.equal(preview.connected, false);
    assert.equal(preview.source, "mock");
    assert.match(preview.error ?? "", /401/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

/**
 * Ce dépôt n'a ni NOTION_DATABASE_ID ni NOTION_PAGE_ID : la génération de
 * contenu atteint Notion par recherche. La carte doit rendre compte de cette
 * source-là, pas annoncer « mock » pendant que le reste tourne sur du vrai
 * Notion.
 */
function stubNotion(handler: (url: string, init?: RequestInit) => Response) {
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input instanceof Request ? input.url : input), init)) as typeof fetch;
  return () => { globalThis.fetch = real; };
}

function json(payload: unknown, status = 200, statusText = "OK") {
  return new Response(JSON.stringify(payload), { status, statusText, headers: { "Content-Type": "application/json" } });
}

const searchHit = {
  object: "page",
  id: "page-1",
  properties: { Name: { type: "title", title: [{ plain_text: "Bazar du Feuch" }] } },
};

test("sans identifiant, la carte rend compte de la recherche Notion — pas du mock", async () => {
  const calls: string[] = [];
  const restore = stubNotion((url) => {
    calls.push(url);
    if (url.endsWith("/search")) return json({ results: [searchHit] });
    return json({ results: [{ type: "paragraph", paragraph: { rich_text: [{ plain_text: "Contenu réel." }] } }] });
  });

  try {
    const preview = knowledgeSourcePreview(await knowledgeSourceDiagnostics({ NOTION_API_KEY: "clé" }));
    assert.equal(preview.connected, true);
    assert.equal(preview.source, "notion");
    assert.equal(preview.sectionCount, 1);
    assert.equal(preview.charCount, "Contenu réel.".length);
    assert.equal(preview.items[0].title, "Bazar du Feuch");
    assert.equal(preview.items[0].isMock, false);
    assert.equal(preview.error, null);
  } finally {
    restore();
  }
});

test("l'échantillon reste borné : une recherche, puis un appel de blocs par page", async () => {
  const calls: string[] = [];
  const pages = Array.from({ length: 10 }, (_, index) => ({ ...searchHit, id: `page-${index}` }));
  const restore = stubNotion((url) => {
    calls.push(url);
    if (url.endsWith("/search")) return json({ results: pages, has_more: true, next_cursor: "suite" });
    return json({ results: [] });
  });

  try {
    await knowledgeSourceDiagnostics({ NOTION_API_KEY: "clé" });
    // `has_more` est ignoré volontairement : un Worker ne parcourt pas tout
    // l'espace de travail pour afficher une carte d'état.
    assert.equal(calls.filter((url) => url.endsWith("/search")).length, 1);
    assert.equal(calls.filter((url) => url.includes("/blocks/")).length, 10);
  } finally {
    restore();
  }
});

test("un jeton valide sans page partagée le dit, au lieu d'un vert trompeur", async () => {
  const restore = stubNotion((url) => (url.endsWith("/search") ? json({ results: [] }) : json({ results: [] })));
  try {
    const preview = knowledgeSourcePreview(await knowledgeSourceDiagnostics({ NOTION_API_KEY: "clé" }));
    assert.equal(preview.connected, false);
    assert.match(preview.error ?? "", /aucune page n'est partagée/);
  } finally {
    restore();
  }
});

test("un identifiant explicite reprend la main sur la recherche", async () => {
  const calls: string[] = [];
  const restore = stubNotion((url) => {
    calls.push(url);
    return json({ results: [] });
  });
  try {
    await knowledgeSourceDiagnostics({ NOTION_API_KEY: "clé", NOTION_DATABASE_ID: "db-1" });
    assert.ok(calls.some((url) => url.includes("/databases/db-1/query")));
    assert.ok(!calls.some((url) => url.endsWith("/search")));
  } finally {
    restore();
  }
});

test("sans clé, le message ne réclame plus un identifiant devenu inutile", async () => {
  const preview = knowledgeSourcePreview(await knowledgeSourceDiagnostics({}));
  assert.equal(preview.connected, false);
  assert.equal(preview.error, "NOTION_API_KEY n'est pas configuré dans le Worker.");
});
