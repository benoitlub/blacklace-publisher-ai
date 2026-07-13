import type { AIProvider, AIGenerateInput, AIGenerateOutput, AISchemaParser } from "../types";

const BASE_URL = "https://api.mistral.ai/v1";

function parseJsonResponse(text: string, status: number): any {
  if (!text.trim()) {
    throw new Error(`Mistral API returned an empty response body (${status}).`);
  }
  try {
    return JSON.parse(text);
  } catch (_) {
    throw new Error(`Mistral API returned invalid JSON (${status}): ${text.slice(0, 300)}`);
  }
}

function extractErrorMessage(payload: any, fallback: string): string {
  const candidate = payload?.message ?? payload?.error?.message ?? payload?.error ?? payload?.detail;
  if (typeof candidate === "string" && candidate.trim()) return candidate;
  try {
    const serialized = JSON.stringify(candidate ?? payload);
    return serialized && serialized !== "{}" ? serialized.slice(0, 500) : fallback;
  } catch (_) {
    return fallback;
  }
}

export class MistralProvider implements AIProvider {
  readonly name = "mistral";

  constructor(
    readonly model: string,
    private readonly apiKey: string,
  ) {}

  async generateText(input: AIGenerateInput): Promise<AIGenerateOutput> {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: input.messages,
        temperature: input.temperature ?? 0.8,
        max_tokens: input.maxTokens ?? 800,
      }),
    });

    const text = await response.text();
    const data = parseJsonResponse(text, response.status);

    if (!response.ok) {
      throw new Error(`Mistral API error ${response.status}: ${extractErrorMessage(data, response.statusText)}`);
    }

    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error(`Mistral API returned no generated content for model ${this.model}.`);
    }

    return { content, provider: "mistral", model: this.model, isMock: false };
  }

  async generateStructuredOutput<T>(schema: AISchemaParser<T>, input: AIGenerateInput): Promise<T> {
    const augmented: AIGenerateInput = {
      ...input,
      messages: [
        ...input.messages,
        { role: "user", content: "Réponds UNIQUEMENT avec du JSON valide, sans markdown ni explication." },
      ],
    };
    const result = await this.generateText(augmented);
    const json = result.content.replace(/```(?:json)?\n?/g, "").trim();
    if (!json) throw new Error("Mistral returned an empty structured output.");
    try {
      return schema.parse(JSON.parse(json));
    } catch (error) {
      const message = error instanceof Error ? error.message : "invalid structured output";
      throw new Error(`Mistral structured output is invalid: ${message}. Raw: ${json.slice(0, 300)}`);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const resp = await fetch(`${BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return resp.ok;
    } catch {
      return false;
    }
  }
}
