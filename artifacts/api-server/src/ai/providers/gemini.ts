import type { AIProvider, AIGenerateInput, AIGenerateOutput, AISchemaParser } from "../types";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";

  constructor(
    readonly model: string,
    private readonly apiKey: string,
  ) {}

  async generateText(input: AIGenerateInput): Promise<AIGenerateOutput> {
    const systemMessages = input.messages.filter((m) => m.role === "system");
    const otherMessages = input.messages.filter((m) => m.role !== "system");
    const systemInstruction = systemMessages.map((m) => m.content).join("\n");

    const contents = otherMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: input.temperature ?? 0.8,
        maxOutputTokens: input.maxTokens ?? 800,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const url = `${BASE_URL}/${this.model}:generateContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    };
    const content = data.candidates[0]?.content?.parts[0]?.text ?? "";
    return { content, provider: "gemini", model: this.model, isMock: false };
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
      const url = `${BASE_URL}?key=${this.apiKey}`;
      const resp = await fetch(url);
      return resp.ok;
    } catch {
      return false;
    }
  }
}
