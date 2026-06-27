import type { Capability } from "octopus-engine";
import { Guardian } from "octopus-engine";

/**
 * CapabilityResolver — source de vérité des capabilities disponibles
 * dans le runtime Octopus actuel.
 *
 * Rôle : exposer les capabilities enregistrées et déléguer leur validation
 * au Guardian depuis octopus-engine. Découple le catalogue des capabilities
 * de la logique de matching du MissionPlanner.
 */
export class CapabilityResolver {
  private readonly guardian: Guardian;
  private readonly capabilities: Capability[];

  constructor(capabilities: Capability[]) {
    this.capabilities = capabilities;
    this.guardian = new Guardian(capabilities);
  }

  /**
   * Valide que toutes les capabilities requises sont disponibles.
   * Lève `Error("Capability missing: <id>")` à la première absente.
   */
  validate(required: string[]): void {
    this.guardian.validate(required);
  }

  /** Retourne true si la capability est enregistrée. */
  has(capId: string): boolean {
    return this.guardian.has(capId);
  }

  /** Liste toutes les capabilities disponibles dans le runtime. */
  list(): Capability[] {
    return [...this.capabilities];
  }

  /** Liste uniquement les ids. */
  listIds(): string[] {
    return this.capabilities.map((c) => c.id);
  }
}

/**
 * Capabilities disponibles en V1.
 * Étendre ici quand un nouveau module métier est ajouté au Coordinator Publisher.
 */
export const RUNTIME_CAPABILITIES: Capability[] = [
  { id: "text_generation", description: "Génération de texte structuré" },
  { id: "outline_builder", description: "Construction de plans d'articles" },
  { id: "text_analysis", description: "Analyse sémantique de texte" },
  { id: "profile_synthesizer", description: "Synthèse de profils client" },
];

/** Singleton prêt à l'emploi pour le runtime courant. */
export const capabilityResolver = new CapabilityResolver(RUNTIME_CAPABILITIES);
