import { describe, expect, it } from "vitest";
import { composeExpertise } from "../expertise-composer.js";

describe("composeExpertise", () => {
  it("selects a professional recipe for an Amazon book launch", () => {
    const selection = composeExpertise({
      universe: "TERRA",
      platform: "KDP",
      prompt: "Prépare le lancement Amazon de mon ebook",
    });

    expect(selection.recipeId).toBe("kdp-launch");
    expect(selection.profiles.map((profile) => profile.id)).toEqual([
      "kdp",
      "branding",
      "marketing",
      "seo",
      "storytelling",
    ]);
  });

  it("uses a social recipe without creating an agent swarm", () => {
    const selection = composeExpertise({
      universe: "Blacklace",
      platform: "Instagram",
      prompt: "Un Reel narratif",
    });

    expect(selection.recipeId).toBe("social-story");
    expect(selection.promptBlock).toContain("Expert social media");
    expect(selection.promptBlock).not.toContain("agent autonome");
  });

  it("caps the number of injected profiles", () => {
    const selection = composeExpertise({
      universe: "TERRA",
      platform: "KDP",
      prompt: "Amazon ebook livre SEO marketing storytelling branding",
    }, 3);

    expect(selection.profiles).toHaveLength(3);
  });
});
