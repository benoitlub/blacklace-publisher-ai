import type { PublisherGreenhouseResource } from "./types";

export const localPublisherGreenhouseResource: PublisherGreenhouseResource = {
  source: "blacklace-publisher",
  version: "v1",
  generatedAt: new Date().toISOString(),
  contract: "publisher-greenhouse-cuttings",
  cuttings: [
    {
      id: "linkedin-video-post",
      title: "Post LinkedIn avec video",
      capabilities: ["copy", "video", "cta"],
      tools: ["qwen", "krea", "linkedin"],
      status: "candidate",
      notes: "A tester sur une parcelle avant transformation en greffon.",
    },
    {
      id: "saas-observation-pack",
      title: "Observation SaaS vers Knowledge Pack",
      capabilities: ["observe", "extract", "classify", "memory"],
      tools: ["radar", "observatory", "greenhouse"],
      status: "candidate",
      notes: "Bouture locale deja visible dans Publisher. Peut nourrir Octopus sans integration bidirectionnelle.",
    },
    {
      id: "github-repo-observation",
      title: "Observation de depot GitHub",
      capabilities: ["repo-detect", "open-source-signal", "technical-memory"],
      tools: ["github", "observatory", "memory"],
      status: "candidate",
      notes: "Parse owner/repo sans API. Prete pour un futur connecteur GitHub reel.",
    },
  ],
};
