export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIGenerateInput {
  messages: AIMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface AIGenerateOutput {
  content: string;
  provider: string;
  model: string;
  isMock: boolean;
}

export interface AISchemaParser<T> {
  parse(value: unknown): T;
}

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  generateText(input: AIGenerateInput): Promise<AIGenerateOutput>;
  generateStructuredOutput<T>(schema: AISchemaParser<T>, input: AIGenerateInput): Promise<T>;
  embedText?(text: string): Promise<number[]>;
  healthCheck(): Promise<boolean>;
}
