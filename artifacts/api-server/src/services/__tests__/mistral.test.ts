import { describe, it, expect, beforeEach, vi } from "vitest";

const getAIProviderMock = vi.fn();

vi.mock("../../ai/providerRegistry", () => ({
  getAIProvider: () => getAIProviderMock(),
}));

import { generatePostDraft } from "../mistral";

const BASE_INPUT = {
  universe: "Blacklace",
  agentName: "Natasha",
  agentTone: "officiel",
  platform: "Instagram",
  knowledgeContext: "Contexte issu de Notion",
  knowledgeSource: "notion" as const,
};

describe("generatePostDraft fallback scenarios", () => {
  beforeEach(() => {
    getAIProviderMock.mockReset();
  });

  it("falls back to mock when no AI provider is configured", async () => {
    getAIProviderMock.mockReturnValue({ name: "mock", generateText: vi.fn() });

    const draft = await generatePostDraft(BASE_INPUT);

    expect(draft.isMock).toBe(true);
    expect(draft.provider).toBe("mock");
    expect(draft.knowledgeSource).toBe("notion");
    expect(draft.fallbackReason).toContain("Aucun fournisseur IA configuré");
  });

  it("falls back to mock when the configured provider itself returns a mock result", async () => {
    getAIProviderMock.mockReturnValue({
      name: "mistral",
      generateText: vi.fn().mockResolvedValue({ isMock: true, content: "", provider: "mistral" }),
    });

    const draft = await generatePostDraft(BASE_INPUT);

    expect(draft.isMock).toBe(true);
    expect(draft.provider).toBe("mock");
    expect(draft.fallbackReason).toContain("mode mock");
  });

  it("falls back to mock with a readable error when the provider call throws, without throwing itself", async () => {
    getAIProviderMock.mockReturnValue({
      name: "mistral",
      generateText: vi.fn().mockRejectedValue(new Error("network timeout")),
    });

    const draft = await generatePostDraft(BASE_INPUT);

    expect(draft.isMock).toBe(true);
    expect(draft.provider).toBe("mock");
    expect(draft.fallbackReason).toContain("network timeout");
  });

  it("returns a real draft with provider metadata and no fallback reason on success", async () => {
    getAIProviderMock.mockReturnValue({
      name: "mistral",
      generateText: vi.fn().mockResolvedValue({
        isMock: false,
        provider: "mistral",
        model: "mistral-large-latest",
        content: JSON.stringify({
          title: "Titre réel",
          content: "Contenu réel généré",
          hashtags: "#Blacklace",
        }),
      }),
    });

    const draft = await generatePostDraft(BASE_INPUT);

    expect(draft.isMock).toBe(false);
    expect(draft.provider).toBe("mistral");
    expect(draft.model).toBe("mistral-large-latest");
    expect(draft.knowledgeSource).toBe("notion");
    expect(draft.fallbackReason).toBeNull();
    expect(draft.title).toBe("Titre réel");
    expect(draft.content).toBe("Contenu réel généré");
  });
});
