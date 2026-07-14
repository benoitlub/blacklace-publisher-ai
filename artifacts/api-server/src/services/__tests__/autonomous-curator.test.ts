import { describe, expect, it } from "vitest";
import { AutonomousCurator, type CuratorContext, type CuratorSignal } from "../autonomous-curator.js";

const context: CuratorContext = {
  activeMissionIds: ["mission:first-terra-sale"],
  unresolvedNeeds: ["ebook advertising", "qualified prospects"],
  knownCapabilities: ["Canva", "Composio", "Meta Ads"],
};

function signal(overrides: Partial<CuratorSignal>): CuratorSignal {
  return {
    id: "signal-1",
    title: "Verified ebook advertising opportunity",
    source: "manual-radar",
    capturedAt: "2026-07-14T10:00:00.000Z",
    kind: "tool",
    summary: "A reversible service directly relevant to ebook advertising.",
    missionIds: ["mission:first-terra-sale"],
    evidenceRefs: ["official-doc", "independent-review", "pricing-page"],
    estimatedMonthlyCost: 10,
    implementationEffort: 0.2,
    platformRisk: 0.1,
    lockInRisk: 0.1,
    ...overrides,
  };
}

describe("AutonomousCurator", () => {
  it("rejects unsupported advertising claims", () => {
    const curator = new AutonomousCurator();
    const outcome = curator.evaluate(signal({
      id: "ad-only",
      title: "Magic growth in one click",
      missionIds: [],
      evidenceRefs: [],
      claims: ["67 sales in one week"],
    }), context);

    expect(["discarded", "watching"]).toContain(outcome.decision);
    expect(outcome.recommendation).toBeUndefined();
  });

  it("promotes only a high-confidence mission-relevant candidate", () => {
    const curator = new AutonomousCurator();
    const outcome = curator.evaluate(signal({}), context);

    expect(outcome.decision).toBe("candidate-prepared");
    expect(outcome.recommendation?.evidenceRefs).toHaveLength(3);
  });

  it("enriches knowledge instead of recommending a duplicate capability", () => {
    const curator = new AutonomousCurator();
    const outcome = curator.evaluate(signal({
      id: "duplicate-canva",
      title: "Canva ebook advertising templates",
      tags: ["Canva", "ebook advertising"],
    }), context);

    expect(outcome.decision).toBe("knowledge-updated");
    expect(outcome.recommendation).toBeUndefined();
  });

  it("deduplicates clusters and limits promoted candidates", () => {
    const curator = new AutonomousCurator({
      minimumEvidenceQuality: 0.5,
      minimumMissionRelevance: 0.5,
      promotionThreshold: 0.6,
      watchingThreshold: 0.4,
      rawSignalTtlDays: 14,
      maximumCandidatesPerCycle: 1,
    });

    const outcomes = curator.curate([
      signal({ id: "one", title: "Ebook Ads Service", tags: ["ebook advertising"] }),
      signal({ id: "two", title: "Ebook Ads Service", tags: ["ebook advertising"], estimatedMonthlyCost: 5 }),
      signal({ id: "three", title: "Qualified prospects source", kind: "client", tags: ["qualified prospects"] }),
    ], context);

    expect(outcomes).toHaveLength(2);
    expect(outcomes.filter((item) => item.decision === "candidate-prepared")).toHaveLength(1);
  });
});
