import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  knowledge: {
    slug: "yael-bali",
    verified: false,
    source: "mock" as "notion" | "mock",
    items: [] as unknown[],
    prompt: "",
    missingFacts: ["verified-client-or-product-context"],
    diagnostics: {
      connected: false,
      error: null,
      totalItems: 0,
      matchedItems: 0,
    },
  },
  generatePostDraft: vi.fn(),
  plan: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("../services/knowledge-package-resolver", () => ({
  resolveKnowledgePackage: async () => mocks.knowledge,
}));

vi.mock("../services/mistral", () => ({
  generatePostDraft: mocks.generatePostDraft,
}));

vi.mock("./production-engine", () => ({
  productionEngine: {
    plan: mocks.plan,
    execute: mocks.execute,
  },
}));

function envelope(capability: string) {
  return {
    contract: "octopus-adapter-execution-v1" as const,
    adapterId: "publisher",
    mission: {
      operationId: "op-1",
      title: "Campagne Yael Bali",
      objective: "Produire un texte exploitable pour Yael Bali.",
      requiredCapabilities: [capability],
      authorizedResources: [],
      prompt: "Prépare une campagne.",
      context: {
        id: "project-yael-prospection",
        label: "Yael Bali",
        metadata: { parcelId: "project-yael-prospection" },
      },
    },
  };
}

describe("executePublisherAdapter", () => {
  beforeEach(() => {
    mocks.knowledge = {
      slug: "yael-bali",
      verified: false,
      source: "mock",
      items: [],
      prompt: "",
      missingFacts: ["verified-client-or-product-context"],
      diagnostics: {
        connected: false,
        error: null,
        totalItems: 0,
        matchedItems: 0,
      },
    };
    mocks.generatePostDraft.mockReset();
    mocks.plan.mockReset();
    mocks.execute.mockReset();
  });

  it("returns needs-input and does not generate content without a verified Knowledge Package", async () => {
    const { executePublisherAdapter } = await import("./octopus-adapter");

    const result = await executePublisherAdapter(envelope("content.social.write"));

    expect(result.status).toBe("needs-input");
    expect(result.output).toMatchObject({ missingFacts: ["verified-client-or-product-context"] });
    expect(mocks.generatePostDraft).not.toHaveBeenCalled();
  });

  it("uses verified Notion facts before calling the text producer", async () => {
    mocks.knowledge = {
      slug: "yael-bali",
      verified: true,
      source: "notion",
      items: [{ id: "yael-1" }],
      prompt: "Yael Bali est courtière en prêts immobiliers.",
      missingFacts: [],
      diagnostics: {
        connected: true,
        error: null,
        totalItems: 1,
        matchedItems: 1,
      },
    };
    mocks.generatePostDraft.mockResolvedValue({
      title: "Campagne Yael Bali",
      content: "Texte basé sur les faits vérifiés.",
      hashtags: "#YaelBali",
      provider: "mock",
      model: "mock",
      knowledgeSource: "notion",
      isMock: true,
      fallbackReason: null,
    });
    const { executePublisherAdapter } = await import("./octopus-adapter");

    const result = await executePublisherAdapter(envelope("content.social.write"));

    expect(result.status).toBe("completed");
    expect(mocks.generatePostDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        universe: "yael-bali",
        knowledgeContext: "Yael Bali est courtière en prêts immobiliers.",
        knowledgeSource: "notion",
      }),
    );
    expect(result.output).toMatchObject({
      knowledgePackage: { slug: "yael-bali", verified: true, itemCount: 1 },
    });
  });
});
