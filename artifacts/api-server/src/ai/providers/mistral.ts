import type { AIProvider, AIGenerateInput, AIGenerateOutput, AISchemaParser } from "../types";

const BASE_URL = "https://api.mistral.ai/v1";

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

    if (!response.ok) {
      throw new Error(`Mistral API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const content = data.choices[0]?.message?.content ?? "";
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
    return schema.parse(JSON.parse(json));
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
