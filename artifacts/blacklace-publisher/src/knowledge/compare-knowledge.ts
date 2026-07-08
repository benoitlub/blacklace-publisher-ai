import type { KnowledgeComparison, KnowledgeComparisonReport } from "@/models/knowledge-comparison";
import type { ObservationMemoryEntry } from "@/models/observation-memory";

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalize(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

function intersection(left: string[], right: string[]): string[] {
  const rightSet = new Set(normalize(right));
  return normalize(left).filter((value) => rightSet.has(value));
}

function difference(left: string[], right: string[]): string[] {
  const rightSet = new Set(normalize(right));
  return normalize(left).filter((value) => !rightSet.has(value));
}

function similarity(left: string[], right: string[]): number {
  const all = new Set([...normalize(left), ...normalize(right)]);
  if (!all.size) return 0;
  return Math.round((intersection(left, right).length / all.size) * 100);
}

function decide(similarityScore: number, noveltyScore: number, sharedPatterns: string[]): KnowledgeComparison["recommendation"] {
  if (noveltyScore >= 70 && similarityScore <= 35) return "seed";
  if (similarityScore >= 70 && sharedPatterns.length >= 2) return "compare";
  if (similarityScore >= 55) return "article";
  if (noveltyScore >= 45) return "watch";
  return "ignore";
}

function explain(decision: KnowledgeComparison["recommendation"], left: ObservationMemoryEntry, right: ObservationMemoryEntry): string {
  switch (decision) {
    case "seed":
      return `${left.name} et ${right.name} couvrent des territoires assez differents : potentiel Seed pour enrichir le jardin.`;
    case "compare":
      return `${left.name} et ${right.name} partagent beaucoup de signaux : bonne paire pour comparaison detaillee.`;
    case "article":
      return `${left.name} et ${right.name} ont assez de points communs pour nourrir un angle editorial.`;
    case "watch":
      return `Le lien entre ${left.name} et ${right.name} merite une surveillance, mais pas encore une action forte.`;
    case "ignore":
    default:
      return `Peu de signaux exploitables entre ${left.name} et ${right.name} pour l'instant.`;
  }
}

export function compareObservationMemory(entries: ObservationMemoryEntry[]): KnowledgeComparisonReport {
  const comparisons: KnowledgeComparison[] = [];

  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
      const left = entries[leftIndex];
      const right = entries[rightIndex];
      const leftCapabilities = left.lastPack.capabilities ?? [];
      const rightCapabilities = right.lastPack.capabilities ?? [];
      const leftPatterns = left.lastPack.patterns ?? [];
      const rightPatterns = right.lastPack.patterns ?? [];
      const sharedCapabilities = intersection(leftCapabilities, rightCapabilities);
      const leftOnlyCapabilities = difference(leftCapabilities, rightCapabilities);
      const rightOnlyCapabilities = difference(rightCapabilities, leftCapabilities);
      const sharedPatterns = intersection(leftPatterns, rightPatterns);
      const sharedTags = intersection(left.tags, right.tags);
      const similarityScore = Math.round((
        similarity(leftCapabilities, rightCapabilities) * 0.35 +
        similarity(leftPatterns, rightPatterns) * 0.35 +
        similarity(left.tags, right.tags) * 0.30
      ));
      const noveltyScore = Math.max(0, 100 - similarityScore + Math.min(20, leftOnlyCapabilities.length * 5 + rightOnlyCapabilities.length * 5));
      const recommendation = decide(similarityScore, noveltyScore, sharedPatterns);

      comparisons.push({
        id: createId("comparison"),
        left,
        right,
        similarityScore,
        noveltyScore,
        sharedCapabilities,
        leftOnlyCapabilities,
        rightOnlyCapabilities,
        sharedPatterns,
        sharedTags,
        recommendation,
        rationale: explain(recommendation, left, right),
      });
    }
  }

  const sorted = comparisons.sort((a, b) => b.similarityScore - a.similarityScore);
  const noveltySorted = [...comparisons].sort((a, b) => b.noveltyScore - a.noveltyScore);

  return {
    generatedAt: new Date().toISOString(),
    comparisons: sorted,
    strongestPair: sorted[0],
    mostNovelPair: noveltySorted[0],
  };
}
