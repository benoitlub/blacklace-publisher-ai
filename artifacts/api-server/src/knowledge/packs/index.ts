import { businessGrowthPack } from "./business-growth-pack";
import type { KnowledgePack } from "./types";

const packs: Record<string, KnowledgePack> = {
  [businessGrowthPack.id]: businessGrowthPack,
};

export function getKnowledgePack(id = process.env.KNOWLEDGE_PACK ?? businessGrowthPack.id): KnowledgePack {
  return packs[id] ?? businessGrowthPack;
}

export function listKnowledgePacks(): KnowledgePack[] {
  return Object.values(packs);
}

export { businessGrowthPack, createBusinessGrowthSeed } from "./business-growth-pack";
export type {
  BusinessGrowthCompatibility,
  BusinessGrowthCoordinates,
  BusinessGrowthHistory,
  BusinessGrowthIdentity,
  BusinessGrowthIntelligence,
  BusinessGrowthModule,
  BusinessGrowthRecommendations,
  BusinessGrowthSeed,
  KnowledgePack,
  KnowledgePackAgent,
  KnowledgePackExample,
} from "./types";
