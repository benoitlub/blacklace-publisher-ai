export interface PackAgent {
  name: string;
  role: string;
  tone: string;
  missions: string[];
  limits: string[];
  examples: string[];
}

export interface KnowledgePack {
  id: string;
  name: string;
  description: string;
  universes: string[];
  agents: PackAgent[];
  toneRules: string[];
  forbiddenTopics: string[];
  platforms: string[];
  editorialGoals: string[];
  hashtags: string[];
  examples: string[];
}
