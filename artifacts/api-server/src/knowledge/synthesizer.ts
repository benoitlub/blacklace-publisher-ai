import type { KnowledgeObservation, KnowledgeSourceKind } from "./harvesters";

export interface KnowledgePackage {
  version: number;
  id: string;
  parcelId: string;
  parcelName: string;
  status: "empty" | "growing" | "usable" | "rich";
  coverage: number;
  confidence: number;
  summary: string;
  facts: Array<{ statement: string; sources: string[] }>;
  sourceCoverage: Partial<Record<KnowledgeSourceKind, number>>;
  sources: Array<{ id: string; kind: KnowledgeSourceKind; title: string; url: string | null; observedAt: string }>;
  contradictions: Array<{ left: string; right: string }>;
  generatedAt: string;
  previousVersion: number | null;
}

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function deduplicateFacts(observations: KnowledgeObservation[]) {
  const facts = new Map<string, { statement: string; sources: Set<string> }>();
  for (const observation of observations) {
    for (const statement of observation.facts) {
      const key = normalize(statement);
      if (!key) continue;
      const existing = facts.get(key) ?? { statement, sources: new Set<string>() };
      existing.sources.add(observation.sourceId);
      facts.set(key, existing);
    }
  }
  return [...facts.values()]
    .map((fact) => ({ statement: fact.statement, sources: [...fact.sources] }))
    .sort((a, b) => b.sources.length - a.sources.length || a.statement.localeCompare(b.statement))
    .slice(0, 80);
}

function detectContradictions(facts: Array<{ statement: string; sources: string[] }>) {
  const contradictions: Array<{ left: string; right: string }> = [];
  for (let leftIndex = 0; leftIndex < facts.length; leftIndex += 1) {
    const left = normalize(facts[leftIndex].statement);
    for (let rightIndex = leftIndex + 1; rightIndex < facts.length; rightIndex += 1) {
      const right = normalize(facts[rightIndex].statement);
      const opposite = (left.includes(" ne ") && !right.includes(" ne ")) || (!left.includes(" ne ") && right.includes(" ne "));
      const overlap = left.split(" ").filter((word) => word.length > 4 && right.includes(word)).length;
      if (opposite && overlap >= 3) contradictions.push({ left: facts[leftIndex].statement, right: facts[rightIndex].statement });
      if (contradictions.length >= 10) return contradictions;
    }
  }
  return contradictions;
}

export function synthesizeKnowledgePackage(input: {
  parcelId: string;
  parcelName: string;
  observations: KnowledgeObservation[];
  previous?: KnowledgePackage | null;
}): KnowledgePackage {
  const observations = input.observations.filter((item) => item.parcelId === input.parcelId);
  const facts = deduplicateFacts(observations);
  const kinds = new Set(observations.map((item) => item.sourceKind));
  const sourceCoverage: KnowledgePackage["sourceCoverage"] = {};
  for (const kind of kinds) sourceCoverage[kind] = observations.filter((item) => item.sourceKind === kind).length;

  const sourceScore = Math.min(35, kinds.size * 9);
  const volumeScore = Math.min(35, facts.length * 2);
  const corroborationScore = Math.min(20, facts.filter((fact) => fact.sources.length > 1).length * 4);
  const freshnessScore = observations.some((item) => Date.now() - new Date(item.observedAt).getTime() < 30 * 24 * 60 * 60_000) ? 10 : 0;
  const coverage = Math.min(100, sourceScore + volumeScore + corroborationScore + freshnessScore);
  const confidence = Math.min(100, Math.round(coverage * 0.7 + Math.min(30, observations.length * 3)));
  const status: KnowledgePackage["status"] = coverage >= 85 ? "rich" : coverage >= 60 ? "usable" : coverage > 0 ? "growing" : "empty";
  const summaryFacts = facts.slice(0, 6).map((fact) => fact.statement);

  return {
    version: (input.previous?.version ?? 0) + 1,
    id: `knowledge-package:${input.parcelId}`,
    parcelId: input.parcelId,
    parcelName: input.parcelName,
    status,
    coverage,
    confidence,
    summary: summaryFacts.length > 0
      ? `${input.parcelName} : ${summaryFacts.join(" ")}`
      : `Publisher ne possède pas encore assez d'informations sur ${input.parcelName}.`,
    facts,
    sourceCoverage,
    sources: observations.map((item) => ({
      id: item.sourceId,
      kind: item.sourceKind,
      title: item.title,
      url: item.sourceUrl,
      observedAt: item.observedAt,
    })),
    contradictions: detectContradictions(facts),
    generatedAt: new Date().toISOString(),
    previousVersion: input.previous?.version ?? null,
  };
}
