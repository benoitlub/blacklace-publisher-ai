export type Capability = {
  readonly id: string;
  readonly description?: string;
};

/**
 * CapabilityResolver — catalogue local et déterministe des capacités Publisher.
 *
 * Il ne dépend plus du paquet octopus-engine. Le moteur distant valide ensuite
 * ses propres capacités au moment de l'exécution réelle de la mission.
 */
export class CapabilityResolver {
  private readonly capabilities: Capability[];
  private readonly capabilityIds: Set<string>;

  constructor(capabilities: Capability[]) {
    this.capabilities = capabilities.map((capability) => ({ ...capability }));
    this.capabilityIds = new Set(this.capabilities.map((capability) => capability.id));
  }

  /**
   * Valide que toutes les capacités requises sont connues par Publisher.
   * Octopus Engine conserve sa propre validation côté exécution.
   */
  validate(required: string[]): void {
    for (const capabilityId of required) {
      if (!this.has(capabilityId)) {
        throw new Error(`Capability missing: ${capabilityId}`);
      }
    }
  }

  has(capId: string): boolean {
    return this.capabilityIds.has(capId);
  }

  list(): Capability[] {
    return this.capabilities.map((capability) => ({ ...capability }));
  }

  listIds(): string[] {
    return this.capabilities.map((capability) => capability.id);
  }
}

export const RUNTIME_CAPABILITIES: Capability[] = [
  { id: "text_generation", description: "Génération de texte structuré" },
  { id: "outline_builder", description: "Construction de plans d'articles" },
  { id: "text_analysis", description: "Analyse sémantique de texte" },
  { id: "profile_synthesizer", description: "Synthèse de profils client" },
];

export const capabilityResolver = new CapabilityResolver(RUNTIME_CAPABILITIES);
