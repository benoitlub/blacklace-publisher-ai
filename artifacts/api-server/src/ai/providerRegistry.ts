import { logger } from "../lib/logger";
import type { AIProvider } from "./types";
import { MockProvider } from "./providers/mock";
import { MistralProvider } from "./providers/mistral";
import { OpenAIProvider } from "./providers/openai";
import { AnthropicProvider } from "./providers/anthropic";
import { GeminiProvider } from "./providers/gemini";
import { OllamaProvider } from "./providers/ollama";
import { OpenRouterProvider } from "./providers/openrouter";
import { CustomProvider } from "./providers/custom";

let _instance: AIProvider | null = null;

function resolveApiKey(providerSpecificKey?: string): string {
  return process.env.AI_API_KEY ?? providerSpecificKey ?? "";
}

function buildProvider(): AIProvider {
  const providerName = (process.env.AI_PROVIDER ?? "mock").toLowerCase();
  const model = process.env.AI_MODEL;

  switch (providerName) {
    case "mistral": {
      const apiKey = resolveApiKey(process.env.MISTRAL_API_KEY);
      if (!apiKey) {
        logger.warn("AI_PROVIDER=mistral but no API key found — falling back to mock");
        return new MockProvider();
      }
      const m = model ?? "mistral-large-latest";
      logger.info({ provider: "mistral", model: m }, "AI provider initialized");
      return new MistralProvider(m, apiKey);
    }

    case "openai": {
      const apiKey = resolveApiKey(process.env.OPENAI_API_KEY);
      if (!apiKey) {
        logger.warn("AI_PROVIDER=openai but no API key found — falling back to mock");
        return new MockProvider();
      }
      const m = model ?? "gpt-4o-mini";
      logger.info({ provider: "openai", model: m }, "AI provider initialized");
      return new OpenAIProvider(m, apiKey);
    }

    case "anthropic": {
      const apiKey = resolveApiKey(process.env.ANTHROPIC_API_KEY);
      if (!apiKey) {
        logger.warn("AI_PROVIDER=anthropic but no API key found — falling back to mock");
        return new MockProvider();
      }
      const m = model ?? "claude-sonnet-4-5";
      logger.info({ provider: "anthropic", model: m }, "AI provider initialized");
      return new AnthropicProvider(m, apiKey);
    }

    case "gemini": {
      const apiKey = resolveApiKey(process.env.GEMINI_API_KEY);
      if (!apiKey) {
        logger.warn("AI_PROVIDER=gemini but no API key found — falling back to mock");
        return new MockProvider();
      }
      const m = model ?? "gemini-2.0-flash";
      logger.info({ provider: "gemini", model: m }, "AI provider initialized");
      return new GeminiProvider(m, apiKey);
    }

    case "ollama": {
      const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
      const m = model ?? "llama3.1";
      logger.info({ provider: "ollama", model: m, baseUrl }, "AI provider initialized");
      return new OllamaProvider(m, baseUrl);
    }

    case "openrouter": {
      const apiKey = resolveApiKey(process.env.OPENROUTER_API_KEY);
      if (!apiKey) {
        logger.warn("AI_PROVIDER=openrouter but no API key found — falling back to mock");
        return new MockProvider();
      }
      const m = model ?? "openai/gpt-4o-mini";
      logger.info({ provider: "openrouter", model: m }, "AI provider initialized");
      return new OpenRouterProvider(m, apiKey);
    }

    case "custom": {
      const baseUrl = process.env.AI_BASE_URL ?? "";
      if (!baseUrl) {
        logger.warn("AI_PROVIDER=custom but AI_BASE_URL is not set — falling back to mock");
        return new MockProvider();
      }
      const apiKey = process.env.AI_API_KEY ?? "";
      const m = model ?? "custom";
      logger.info({ provider: "custom", model: m, baseUrl }, "AI provider initialized");
      return new CustomProvider(m, baseUrl, apiKey);
    }

    case "mock":
    default: {
      if (providerName !== "mock") {
        logger.warn({ providerName }, "Unknown AI_PROVIDER — falling back to mock");
      } else {
        logger.info("AI provider initialized in mock mode");
      }
      return new MockProvider();
    }
  }
}

export function getAIProvider(): AIProvider {
  if (!_instance) {
    _instance = buildProvider();
  }
  return _instance;
}

export function resetAIProvider(): void {
  _instance = null;
}

export type { AIProvider };
