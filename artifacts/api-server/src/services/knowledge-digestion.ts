import { listGlobalState, readGlobalState, writeGlobalState } from "./global-state";

export type KnowledgeMaturity = "observed" | "validated" | "proven" | "reference";
export type KnowledgeKind = "tool" | "technique" | "workflow" | "pattern" | "expertise" | "source";

export interface KnowledgeSource { label: string; url?: string; evidence?: string; capturedAt?: string }
export interface KnowledgeActivationRule { missionTypes: string[]; artifactTypes: string[]; audienceTags: string[]; expertises: string[] }
export interface KnowledgeItem {
  id: string; title: string; summary: string; kind: KnowledgeKind; categories: string[]; expertises: string[];
  tags: string[]; confidence: number; maturity: KnowledgeMaturity; sources: KnowledgeSource[];
  activationRules: KnowledgeActivationRule; relatedSeeds: string[]; testedOnParcels: string[];
  observations: number; successfulUses: number; createdAt: string; updatedAt: string;
}
export interface DigestObservation {
  id?: string; title: string; summary: string; kind?: KnowledgeKind; categories?: string[]; expertises?: string[];
  tags?: string[]; confidence?: number; source: KnowledgeSource; activationRules?: Partial<KnowledgeActivationRule>;
  relatedSeeds?: string[];
}

const NAMESPACE = "knowledge-digestion";
const slug = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
const unique = (values: readonly string[] = []) => [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const maturityFor = (observations: number, successfulUses: number): KnowledgeMaturity => successfulUses >= 5 ? "reference" : successfulUses >= 1 ? "proven" : observations >= 2 ? "validated" : "observed";

function mergeRules(current: KnowledgeActivationRule, incoming: Partial<KnowledgeActivationRule> = {}): KnowledgeActivationRule {
  return {
    missionTypes: unique([...(current.missionTypes || []), ...(incoming.missionTypes || [])]),
    artifactTypes: unique([...(current.artifactTypes || []), ...(incoming.artifactTypes || [])]),
    audienceTags: unique([...(current.audienceTags || []), ...(incoming.audienceTags || [])]),
    expertises: unique([...(current.expertises || []), ...(incoming.expertises || [])]),
  };
}

export async function digestObservation(input: DigestObservation): Promise<{ action: "created" | "enriched"; item: KnowledgeItem }> {
  const key = input.id || slug(input.title);
  const existing = await readGlobalState<KnowledgeItem>(NAMESPACE, key);
  const now = new Date().toISOString();
  if (!existing) {
    const item: KnowledgeItem = {
      id: key, title: input.title, summary: input.summary, kind: input.kind || "source",
      categories: unique(input.categories), expertises: unique(input.expertises), tags: unique(input.tags),
      confidence: clamp(input.confidence ?? 0.55), maturity: "observed",
      sources: [{ ...input.source, capturedAt: input.source.capturedAt || now }],
      activationRules: mergeRules({ missionTypes: [], artifactTypes: [], audienceTags: [], expertises: [] }, input.activationRules),
      relatedSeeds: unique(input.relatedSeeds), testedOnParcels: [], observations: 1, successfulUses: 0,
      createdAt: now, updatedAt: now,
    };
    await writeGlobalState(NAMESPACE, key, item);
    return { action: "created", item };
  }
  const previous = existing.value;
  const observations = previous.observations + 1;
  const item: KnowledgeItem = {
    ...previous, title: input.title || previous.title, summary: input.summary || previous.summary,
    kind: input.kind || previous.kind, categories: unique([...previous.categories, ...(input.categories || [])]),
    expertises: unique([...previous.expertises, ...(input.expertises || [])]), tags: unique([...previous.tags, ...(input.tags || [])]),
    confidence: clamp(Math.max(previous.confidence, input.confidence ?? 0, previous.confidence + 0.05)),
    sources: [...previous.sources, { ...input.source, capturedAt: input.source.capturedAt || now }],
    activationRules: mergeRules(previous.activationRules, input.activationRules),
    relatedSeeds: unique([...previous.relatedSeeds, ...(input.relatedSeeds || [])]),
    observations, maturity: maturityFor(observations, previous.successfulUses), updatedAt: now,
  };
  await writeGlobalState(NAMESPACE, key, item);
  return { action: "enriched", item };
}

export async function recordKnowledgeUse(id: string, parcelId: string, successful: boolean): Promise<KnowledgeItem | null> {
  const record = await readGlobalState<KnowledgeItem>(NAMESPACE, id);
  if (!record) return null;
  const previous = record.value;
  const successfulUses = previous.successfulUses + (successful ? 1 : 0);
  const item = { ...previous, testedOnParcels: unique([...previous.testedOnParcels, parcelId]), successfulUses, maturity: maturityFor(previous.observations, successfulUses), updatedAt: new Date().toISOString() };
  await writeGlobalState(NAMESPACE, id, item);
  return item;
}

export async function listKnowledge(): Promise<KnowledgeItem[]> {
  return (await listGlobalState<KnowledgeItem>(NAMESPACE)).map((record) => record.value).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function selectKnowledgeForMission(input: { missionType?: string; artifactType?: string; audienceTags?: string[]; expertises?: string[]; limit?: number }): Promise<KnowledgeItem[]> {
  const items = await listKnowledge();
  const requested = unique(input.expertises);
  const audiences = unique(input.audienceTags).map(slug);
  return items
    .filter((item) => audiences.length === 0 || [...item.activationRules.audienceTags, ...item.tags, ...item.categories, ...item.relatedSeeds, ...item.testedOnParcels].map(slug).some((value) => audiences.includes(value)))
    .map((item) => {
      let score = item.confidence;
      if (input.missionType && item.activationRules.missionTypes.includes(input.missionType)) score += 0.5;
      if (input.artifactType && item.activationRules.artifactTypes.includes(input.artifactType)) score += 0.5;
      score += requested.filter((value) => item.expertises.includes(value) || item.activationRules.expertises.includes(value)).length * 0.25;
      score += ({ observed: 0, validated: 0.15, proven: 0.35, reference: 0.5 })[item.maturity];
      return { item, score };
    })
    .filter(({ score }) => score > 0.7)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(input.limit || 8, 20)))
    .map(({ item }) => item);
}
