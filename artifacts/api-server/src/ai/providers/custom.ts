import type { AIProvider, AIGenerateInput, AIGenerateOutput, AISchemaParser } from "../types";

export class CustomProvider implements AIProvider {
  readonly name = "custom";

  constructor(
    readonly model: string,
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async generateText(input: AIGenerateInput): Promise<AIGenerateOutput> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.model,
        messages: input.messages,
        temperature: input.temperature ?? 0.8,
        max_tokens: input.maxTokens ?? 800,
      }),
    });

    if (!response.ok) {
      throw new Error(`Custom API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const content = data.choices[0]?.message?.content ?? "";
    return { content, provider: "custom", model: this.model, isMock: false };
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
      const headers: Record<string, string> = {};
      if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;
      const resp = await fetch(`${this.baseUrl}/models`, { headers });
      return resp.ok;
    } catch {
      return false;
    }
  }
}
