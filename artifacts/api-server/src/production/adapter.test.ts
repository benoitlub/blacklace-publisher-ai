import { describe, expect, it } from "vitest";
import type { KnowledgePackage } from "../knowledge/synthesizer";
import { produceDeliverable } from "./adapter";
import { buildProductionRequest } from "./producer";

function knowledgePackage(overrides: Partial<KnowledgePackage> = {}): KnowledgePackage {
  return {
    version: 3,
    id: "knowledge:parcel-1:3",
    parcelId: "Parcel 1",
    parcelName: "Parcel <One>",
    status: "usable",
    coverage: 72,
    confidence: 81,
    summary: "Résumé & contexte vérifié.",
    facts: [
      { statement: "Premier fait <fiable>.", sources: ["source-1"] },
      { statement: "Deuxième fait.", sources: ["source-2"] },
    ],
    sourceCoverage: { notion: 1 },
    sources: [{ id: "source-1", kind: "notion", title: "Source", url: null, observedAt: "2026-07-22T00:00:00.000Z" }],
    contradictions: [],
    generatedAt: "2026-07-22T00:00:00.000Z",
    previousVersion: 2,
    ...overrides,
  };
}

describe("deliverable production", () => {
  it("refuses an empty knowledge package", () => {
    expect(() => buildProductionRequest(knowledgePackage({ status: "empty", coverage: 0 }))).toThrow("knowledge-package-empty:Parcel 1");
  });

  it("builds documentation from verified facts", () => {
    const request = buildProductionRequest(knowledgePackage(), "documentation");
    const deliverable = produceDeliverable(request);

    expect(deliverable.filename).toBe("parcel-1-documentation.md");
    expect(deliverable.content).toContain("Premier fait <fiable>.");
    expect(deliverable.content).toContain("Knowledge Package v3");
  });

  it("escapes knowledge before generating a landing page", () => {
    const request = buildProductionRequest(knowledgePackage(), "landing-page");
    const deliverable = produceDeliverable(request);

    expect(deliverable.mediaType).toBe("text/html");
    expect(deliverable.content).toContain("Parcel &lt;One&gt;");
    expect(deliverable.content).toContain("Résumé &amp; contexte vérifié.");
    expect(deliverable.content).toContain("Premier fait &lt;fiable&gt;.");
    expect(deliverable.content).not.toContain("<li>Premier fait <fiable>.</li>");
  });
});
