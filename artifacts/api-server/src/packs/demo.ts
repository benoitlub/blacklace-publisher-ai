import type { KnowledgePack } from "./types";

export const demoPack: KnowledgePack = {
  id: "demo-pack",
  name: "Demo Pack",
  description: "Reusable demo pack for the generic editorial engine.",
  universes: ["Demo Universe", "Author Project", "Product Project"],
  agents: [
    {
      name: "Editor",
      role: "Editorial director",
      tone: "clear, warm, precise",
      missions: ["announce releases", "summarize campaigns", "keep the editorial line clear"],
      limits: ["do not invent product releases", "do not overpromise features"],
      examples: ["A new update is ready to be introduced."],
    },
  ],
  toneRules: ["clear first", "adapt to client voice", "avoid generic filler"],
  forbiddenTopics: ["fake sales claims", "fake metrics", "unverified claims"],
  platforms: ["Instagram", "Facebook", "TikTok", "website"],
  editorialGoals: ["make the project visible", "reuse existing knowledge", "reduce creator workload"],
  hashtags: ["#CreativeWorkflow", "#EditorialAI"],
  examples: ["A product note becomes a social post.", "A project update becomes a campaign."],
};
