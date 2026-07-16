import { describe, expect, it } from "vitest";
import {
  HtmlLocalProducer,
  ProducerRegistry,
  ProductionEngine,
  createDefaultProducerRegistry,
  type Producer,
  type ProducerCapability,
  type ProductionRequest,
} from "./index";

const baseRequest: ProductionRequest = {
  id: "request-1",
  capability: "landing-page",
  title: "Yaebali",
  objective: "Obtenir 15 rendez-vous immobilier.",
};

describe("Production Engine V1", () => {
  it("plans a landing-page production", () => {
    const engine = new ProductionEngine(createDefaultProducerRegistry());
    const plan = engine.plan(baseRequest);

    expect(plan).toMatchObject({
      requestId: "request-1",
      capability: "landing-page",
      status: "ready",
    });
    expect(plan.steps).toHaveLength(1);
  });

  it("chooses HTML local for landing-page", () => {
    const engine = new ProductionEngine(createDefaultProducerRegistry());
    const plan = engine.plan(baseRequest);

    expect(plan.steps[0]).toMatchObject({
      producerId: "html-local",
      producerLabel: "HTML local enrichi",
      connector: "local",
      status: "ready",
    });
  });

  it("falls back to HTML local when a preferred landing producer is unavailable", () => {
    const registry = new ProducerRegistry([
      unavailableLandingProducer("lovable"),
      new HtmlLocalProducer(),
    ]);
    const engine = new ProductionEngine(registry);
    const plan = engine.plan({ ...baseRequest, preferredProducerId: "lovable" });

    expect(plan.status).toBe("ready");
    expect(plan.steps[0]?.producerId).toBe("html-local");
    expect(plan.steps[0]?.alternatives).toContain("lovable");
  });

  it("blocks when no producer can execute the requested capability", () => {
    const registry = new ProducerRegistry([unavailableLandingProducer("lovable")]);
    const engine = new ProductionEngine(registry);
    const plan = engine.plan(baseRequest);

    expect(plan.status).toBe("blocked");
    expect(plan.steps[0]).toMatchObject({
      status: "blocked",
      producerId: null,
    });
  });

  it("marks an unknown capability as unsupported", () => {
    const engine = new ProductionEngine(createDefaultProducerRegistry());
    const plan = engine.plan({ ...baseRequest, capability: "crm-sync" as ProducerCapability });

    expect(plan.status).toBe("unsupported");
    expect(plan.steps[0]).toMatchObject({
      status: "unsupported",
      alternatives: [],
    });
  });

  it("executes a complete responsive landing page through the selected producer", async () => {
    const request: ProductionRequest = {
      ...baseRequest,
      input: {
        audience: "Courtiers indépendants",
        offer: "Une prospection qualifiée et structurée",
        callToAction: "Présenter mon besoin",
        actionUrl: "https://example.com/contact",
        benefits: ["Audience claire", "Message crédible", "Prochain pas simple"],
      },
    };
    const engine = new ProductionEngine(createDefaultProducerRegistry());
    const plan = engine.plan(request);
    const report = await engine.execute(plan, request);

    expect(report.status).toBe("completed");
    expect(report.artifacts[0]).toMatchObject({
      producerId: "html-local",
      capability: "landing-page",
      type: "landing-page.html",
      mimeType: "text/html; charset=utf-8",
      metadata: {
        template: "publisher-rich-landing-v2",
        responsive: true,
        selfContained: true,
      },
    });
    expect(report.artifacts[0]?.content).toContain("<!doctype html>");
    expect(report.artifacts[0]?.content).toContain("<meta name=\"viewport\"");
    expect(report.artifacts[0]?.content).toContain("@media(max-width:780px)");
    expect(report.artifacts[0]?.content).toContain("Yaebali");
    expect(report.artifacts[0]?.content).toContain("Courtiers indépendants");
    expect(report.artifacts[0]?.content).toContain("https://example.com/contact");
    expect(report.artifacts[0]?.content).not.toContain("témoignage client");
  });
});

function unavailableLandingProducer(id: string): Producer {
  return {
    id,
    label: id,
    capability: "landing-page",
    connector: "local",
    cost: "low",
    quality: "high",
    status: "offline",
    alternatives: ["html-local"],
  };
}
