import { AiProviderRegistry } from "./provider-registry";
import { InMemoryQuotaStore } from "./quota-store";
import type { AiGatewayRequest, AiGatewayResponse, AiProvider } from "./types";

export class AiGatewayRouter {
  private lastProviderUsed = "mock";

  constructor(
    private readonly registry = new AiProviderRegistry(),
    private readonly quotaStore = new InMemoryQuotaStore()
  ) {}

  async generate(request: AiGatewayRequest): Promise<AiGatewayResponse> {
    const candidates = this.createCandidates(request);

    for (const candidate of candidates) {
      if (!this.quotaStore.canUse(candidate.id)) {
        continue;
      }

      const response = await candidate.generate(request);
      if (response.ok) {
        this.quotaStore.markSuccess(candidate.id);
        this.lastProviderUsed = candidate.id;
        return {
          ...response,
          fallbackUsed: candidate.id === "mock" && request.preferredProvider !== "mock" ? true : response.fallbackUsed
        };
      }

      this.quotaStore.markFailure(candidate.id);
    }

    const mock = this.registry.get("mock");
    if (!mock) {
      return {
        ok: false,
        provider: "none",
        output: "",
        error: "No AI provider available"
      };
    }

    const response = await mock.generate(request);
    this.lastProviderUsed = mock.id;
    return { ...response, fallbackUsed: true };
  }

  getStatus(): { readonly mode: "mock" | "auto"; readonly lastProviderUsed: string } {
    return {
      mode: this.hasConfiguredRealProvider() ? "auto" : "mock",
      lastProviderUsed: this.lastProviderUsed
    };
  }

  private createCandidates(request: AiGatewayRequest): AiProvider[] {
    const candidates: AiProvider[] = [];
    const preferredProvider = request.preferredProvider ? this.registry.get(request.preferredProvider) : undefined;

    if (preferredProvider?.isConfigured() && preferredProvider.supports(request.task)) {
      candidates.push(preferredProvider);
    }

    const configuredFreeProviders = this.registry
      .forTask(request.task)
      .filter((provider) => provider.id !== "mock")
      .filter((provider) => provider.isFreeTier)
      .filter((provider) => provider.isConfigured());
    candidates.push(...configuredFreeProviders);

    const configuredProvidersWithQuota = this.registry
      .forTask(request.task)
      .filter((provider) => provider.id !== "mock")
      .filter((provider) => provider.isConfigured())
      .filter((provider) => this.quotaStore.canUse(provider.id));
    candidates.push(...configuredProvidersWithQuota);

    const mock = this.registry.get("mock");
    if (mock) {
      candidates.push(mock);
    }

    return dedupeProviders(candidates);
  }

  private hasConfiguredRealProvider(): boolean {
    return this.registry.forTask("text.post").some((provider) => provider.id !== "mock" && provider.isConfigured());
  }
}

function dedupeProviders(providers: readonly AiProvider[]): AiProvider[] {
  const seen = new Set<string>();
  return providers.filter((provider) => {
    if (seen.has(provider.id)) {
      return false;
    }

    seen.add(provider.id);
    return true;
  });
}
