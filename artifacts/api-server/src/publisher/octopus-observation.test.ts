import { describe, expect, it } from "vitest";
import { translateUniversalKnowledge } from "./octopus-observation";

describe("Publisher Octopus knowledge translator", () => {
  it("keeps a first observation novel and under observation", () => {
    const result = translateUniversalKnowledge({
      aggregates: { relatedCount: 0, observedCount: 1 },
      relations: [],
      trend: { direction: "stable", window: "recent" },
    });
    expect(result.noveltyScore).toBe(100);
    expect(result.relevanceScore).toBe(0);
    expect(result.harvestPriority).toBe("observe");
    expect(result.editorialSignal).toBe("new");
  });

  it("prioritizes a recurring and strongly related signal", () => {
    const result = translateUniversalKnowledge({
      aggregates: { relatedCount: 6, observedCount: 8 },
      relations: [
        { targetId: "obs-1", relationType: "similar-to", strength: 0.92 },
        { targetId: "obs-2", relationType: "similar-to", strength: 0.81 },
      ],
      trend: { direction: "increasing", window: "recent" },
    });
    expect(result.harvestPriority).toBe("prioritize");
    expect(result.editorialSignal).toBe("persistent");
    expect(result.relevanceScore).toBeGreaterThanOrEqual(72);
    expect(result.noveltyScore).toBeLessThan(20);
  });
});
