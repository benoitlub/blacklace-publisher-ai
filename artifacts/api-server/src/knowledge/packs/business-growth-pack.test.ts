import { describe, expect, it } from "vitest";
import { businessGrowthPack, createBusinessGrowthSeed, listKnowledgePacks } from "./index.js";

describe("Business Growth Knowledge Package", () => {
  it("is registered as a Knowledge Package", () => {
    const packs = listKnowledgePacks();

    expect(packs.some((pack) => pack.id === "business-growth")).toBe(true);
    expect(businessGrowthPack.businessGrowth?.modules).toEqual([
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

  it("turns a contact into a living commercial Seed", () => {
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

    expect(seed.module).toBe("editeurs");
    expect(seed.identity.nom).toBe("Alice Martin");
    expect(seed.compatibility.projetsCompatibles).toContain("TERRA");
    expect(seed.intelligence.scoreCommercial).toBeGreaterThan(0);
    expect(seed.recommendations.produitAProposer).toBe("TERRA");
    expect(seed.updatedAt).toBe("2026-07-11T12:00:00.000Z");
  });
});
