import { afterEach, describe, expect, it, vi } from "vitest";
import { CompatibleChatProvider } from "./providers/compatible-chat";
import { AiProviderRegistry } from "./provider-registry";
import { AiGatewayRouter } from "./router";
import { MockAiProvider } from "./providers/mock";

afterEach(() => vi.unstubAllGlobals());

describe("optional compatible chat providers", () => {
  const request = { task: "text.post" as const, prompt: "Annonce Blacklace" };

  it("does not activate without credentials", () => {
    const provider = new CompatibleChatProvider("groq", "test-model", "https://example.test/chat", undefined);
    expect(provider.isConfigured()).toBe(false);
  });

  it("returns a real provider response with usage", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: "test-model",
        choices: [{ message: { content: "Bonjour Blacklace" } }],
        usage: { prompt_tokens: 12, completion_tokens: 5 }
      })
    }));
    const provider = new CompatibleChatProvider("groq", "test-model", "https://example.test/chat", "test-key");
    expect(await provider.generate(request)).toMatchObject({
      ok: true, provider: "groq", output: "Bonjour Blacklace",
      usage: { inputTokens: 12, outputTokens: 5 }
    });
  });

  it("falls back when the selected provider fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    const provider = new CompatibleChatProvider("groq", "test-model", "https://example.test/chat", "test-key");
    const router = new AiGatewayRouter(new AiProviderRegistry([provider, new MockAiProvider()]));
    const response = await router.generate({ ...request, preferredProvider: "groq" });
    expect(response.provider).toBe("mock");
    expect(response.fallbackUsed).toBe(true);
  });

  it("never mistakes an empty completion for a valid result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ choices: [{ message: { content: "" } }] })
    }));
    const provider = new CompatibleChatProvider("groq", "test-model", "https://example.test/chat", "test-key");
    expect((await provider.generate(request)).ok).toBe(false);
  });
});
