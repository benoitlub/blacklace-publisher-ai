import type { AIProvider, AIGenerateInput, AIGenerateOutput, AISchemaParser } from "../types";

export class MockProvider implements AIProvider {
  readonly name = "mock";
  readonly model = "mock";

  async generateText(_input: AIGenerateInput): Promise<AIGenerateOutput> {
    return {
      content: "Mode mock actif. Configurez AI_PROVIDER et AI_API_KEY pour une génération réelle.",
      provider: "mock",
      model: "mock",
      isMock: true,
    };
  }

  async generateStructuredOutput<T>(schema: AISchemaParser<T>, _input: AIGenerateInput): Promise<T> {
    try {
      return schema.parse({});
    } catch {
      return {} as T;
    }
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}
