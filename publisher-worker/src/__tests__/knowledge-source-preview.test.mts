/**
 * La carte « Source de connaissance » lit un schéma précis
 * (KnowledgeSourcePreview, lib/api-spec/openapi.yaml). Ces cas verrouillent la
 * mise en forme : c'est tout ce que la route fait en propre.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { knowledgeSourcePreview } from "../worker.ts";
import { fetchBlacklaceKnowledgeWithDiagnostics } from "../knowledge/notion.ts";

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
