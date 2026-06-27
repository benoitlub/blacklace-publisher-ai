import { describe, it, expect } from "vitest";
import { CapabilityResolver, RUNTIME_CAPABILITIES } from "../mission-planner/capability-resolver";

describe("CapabilityResolver", () => {
  it("valide quand toutes les capabilities requises sont présentes", () => {
    const resolver = new CapabilityResolver(RUNTIME_CAPABILITIES);
    expect(() => resolver.validate(["text_generation", "outline_builder"])).not.toThrow();
  });

  it("échoue avec une erreur claire quand une capability manque", () => {
    const resolver = new CapabilityResolver(RUNTIME_CAPABILITIES);
    expect(() => resolver.validate(["text_generation", "non_existent"])).toThrow(
      "Capability missing: non_existent",
    );
  });

  it("has() retourne true pour une capability enregistrée", () => {
    const resolver = new CapabilityResolver(RUNTIME_CAPABILITIES);
    expect(resolver.has("profile_synthesizer")).toBe(true);
  });

  it("has() retourne false pour une capability inconnue", () => {
    const resolver = new CapabilityResolver(RUNTIME_CAPABILITIES);
    expect(resolver.has("llm_brain")).toBe(false);
  });

  it("listIds() retourne uniquement les ids", () => {
    const resolver = new CapabilityResolver(RUNTIME_CAPABILITIES);
    const ids = resolver.listIds();
    expect(ids).toContain("text_generation");
    expect(ids).toContain("profile_synthesizer");
  });
});
