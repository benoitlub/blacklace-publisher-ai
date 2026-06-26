import type { AIProvider, AIGenerateInput, AIGenerateOutput, AISchemaParser } from "../types";

const BASE_URL = "https://api.openai.com/v1";

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";

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
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const content = data.choices[0]?.message?.content ?? "";
    return { content, provider: "openai", model: this.model, isMock: false };
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

  async embedText(text: string): Promise<number[]> {
    const response = await fetch(`${BASE_URL}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI Embeddings error: ${response.status}`);
    }

    const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
    return data.data[0]?.embedding ?? [];
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
