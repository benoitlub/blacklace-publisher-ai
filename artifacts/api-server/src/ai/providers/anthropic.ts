import type { AIProvider, AIGenerateInput, AIGenerateOutput, AISchemaParser } from "../types";

const BASE_URL = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";

  constructor(
    readonly model: string,
    private readonly apiKey: string,
  ) {}

  async generateText(input: AIGenerateInput): Promise<AIGenerateOutput> {
    const systemMessages = input.messages.filter((m) => m.role === "system");
    const userMessages = input.messages.filter((m) => m.role !== "system");
    const system = systemMessages.map((m) => m.content).join("\n");

    const response = await fetch(`${BASE_URL}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: input.maxTokens ?? 800,
        system: system || undefined,
        messages: userMessages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    const content = data.content.find((c) => c.type === "text")?.text ?? "";
    return { content, provider: "anthropic", model: this.model, isMock: false };
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
    return schema.parse(JSON.parse(json));
  }

  async healthCheck(): Promise<boolean> {
    try {
      const resp = await fetch(`${BASE_URL}/models`, {
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
      });
      return resp.ok;
    } catch {
      return false;
    }
  }
}
