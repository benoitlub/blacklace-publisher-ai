import type { AiTaskType } from "./task-types";
import type { AiProvider } from "./types";
import { MistralGatewayProvider } from "./providers/mistral";
import { MockAiProvider } from "./providers/mock";

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

  providers.push(new MockAiProvider());
  return providers;
}
