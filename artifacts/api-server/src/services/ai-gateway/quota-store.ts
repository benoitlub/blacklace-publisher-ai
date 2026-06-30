interface ProviderQuotaState {
  readonly used: number;
  readonly failures: number;
  readonly limit: number;
}

export class InMemoryQuotaStore {
  private readonly state = new Map<string, ProviderQuotaState>();

  canUse(providerId: string): boolean {
    const state = this.getState(providerId);
    return state.used < state.limit;
  }

  markSuccess(providerId: string): void {
    const state = this.getState(providerId);
    this.state.set(providerId, { ...state, used: state.used + 1 });
  }

  markFailure(providerId: string): void {
    const state = this.getState(providerId);
    this.state.set(providerId, { ...state, failures: state.failures + 1 });
  }

  private getState(providerId: string): ProviderQuotaState {
    const existing = this.state.get(providerId);
    if (existing) {
      return existing;
    }

    const initial = {
      used: 0,
      failures: 0,
      limit: readProviderLimit(providerId)
    };
    this.state.set(providerId, initial);
    return initial;
  }
}

function readProviderLimit(providerId: string): number {
  const raw = process.env[`AI_GATEWAY_${providerId.toUpperCase()}_QUOTA`];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.POSITIVE_INFINITY;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.POSITIVE_INFINITY;
}
