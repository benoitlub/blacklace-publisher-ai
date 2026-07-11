import assert from "node:assert/strict";
import { test } from "node:test";
import { businessGrowthPack, createBusinessGrowthSeed, listKnowledgePacks } from "./index.js";

test("Business Growth pack is registered as a Knowledge Package", () => {
  const packs = listKnowledgePacks();

  assert.ok(packs.some((pack) => pack.id === "business-growth"));
  assert.deepEqual(businessGrowthPack.businessGrowth?.modules, [
    "prospects",
    "clients",
    "partenaires",
    "fabricants",
    "editeurs",
    "medias",
    "influenceurs",
    "investisseurs",
    "opportunites",
    "campagnes",
    "relances",
  ]);
});

test("Business Growth turns a contact into a living commercial Seed", () => {
  const seed = createBusinessGrowthSeed({
    module: "editeurs",
    identity: {
      nom: "Alice Martin",
      entreprise: "Maison Exemple",
      role: "éditrice",
      secteur: "livre fantasy",
      pays: "France",
      langue: "fr",
    },
    coordinates: {
      email: "alice@example.test",
      site: "https://example.test",
    },
    history: {
      origineContact: "Salon du livre",
      echanges: [{ date: "2026-07-01", canal: "email", summary: "Premier échange positif.", responseReceived: true }],
      reponsesRecues: ["Intéressée par un extrait."],
      documentsEnvoyes: ["Présentation TERRA"],
      produitsPresentes: ["TERRA"],
    },
    now: "2026-07-11T12:00:00.000Z",
  });

  assert.equal(seed.module, "editeurs");
  assert.equal(seed.identity.nom, "Alice Martin");
  assert.ok(seed.compatibility.projetsCompatibles.includes("TERRA"));
  assert.ok(seed.intelligence.scoreCommercial > 0);
  assert.equal(seed.recommendations.produitAProposer, "TERRA");
  assert.equal(seed.updatedAt, "2026-07-11T12:00:00.000Z");
});
