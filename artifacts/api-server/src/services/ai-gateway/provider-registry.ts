import type { AiTaskType } from "./task-types";
import type { AiProvider } from "./types";
import { MistralGatewayProvider } from "./providers/mistral";
import { MockAiProvider } from "./providers/mock";
import { CompatibleChatProvider } from "./providers/compatible-chat";

export class AiProviderRegistry {
  private readonly providers = new Map<string, AiProvider>();

  constructor(providers: readonly AiProvider[] = createDefaultProviders()) {
    for (const provider of providers) {
      this.register(provider);
    }
  }

  register(provider: AiProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(providerId: string): AiProvider | undefined {
    return this.providers.get(providerId);
  }

  forTask(task: AiTaskType): AiProvider[] {
    return [...this.providers.values()].filter((provider) => provider.supports(task));
  }
}

export function createDefaultProviders(): AiProvider[] {
  const providers: AiProvider[] = [];
  const mistral = new MistralGatewayProvider();

  if (mistral.isConfigured()) {
    providers.push(mistral);
  }

  const openrouter = new CompatibleChatProvider(
    "openrouter",
    process.env.OPENROUTER_MODEL ?? "openrouter/auto",
    "https://openrouter.ai/api/v1/chat/completions",
    process.env.OPENROUTER_API_KEY
  );
  const groq = new CompatibleChatProvider(
    "groq",
    process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
    "https://api.groq.com/openai/v1/chat/completions",
    process.env.GROQ_API_KEY
  );

  if (openrouter.isConfigured()) providers.push(openrouter);
  if (groq.isConfigured()) providers.push(groq);
  providers.push(new MockAiProvider());
  return providers;
}
