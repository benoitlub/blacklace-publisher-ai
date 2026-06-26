import type { AIProvider, AIGenerateInput, AIGenerateOutput, AISchemaParser } from "../types";

export class OllamaProvider implements AIProvider {
  readonly name = "ollama";

  constructor(
    readonly model: string,
    private readonly baseUrl: string,
  ) {}

  async generateText(input: AIGenerateInput): Promise<AIGenerateOutput> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages: input.messages,
        temperature: input.temperature ?? 0.8,
        max_tokens: input.maxTokens ?? 800,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const content = data.choices[0]?.message?.content ?? "";
    return { content, provider: "ollama", model: this.model, isMock: false };
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
      const resp = await fetch(`${this.baseUrl}/api/tags`);
      return resp.ok;
    } catch {
      return false;
    }
  }
}
