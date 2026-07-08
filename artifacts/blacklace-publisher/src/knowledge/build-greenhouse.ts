import type { GreenhouseCluster, GreenhouseMaturity, GreenhouseReport } from "@/models/greenhouse";
import type { ObservationMemoryEntry } from "@/models/observation-memory";

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function clusterTitleFor(entry: ObservationMemoryEntry): string {
  const tags = entry.tags.map(normalize);
  const text = `${entry.name} ${entry.category} ${tags.join(" ")}`;

  if (text.includes("builder") || text.includes("react") || text.includes("app")) return "App builders IA";
  if (text.includes("automation") || text.includes("workflow")) return "Automatisation";
  if (text.includes("github") || text.includes("repo") || text.includes("sdk") || text.includes("open source")) return "Outils développeur";
  if (text.includes("mcp") || text.includes("agent")) return "Infrastructure agents";
  if (text.includes("design") || text.includes("ux") || text.includes("ui")) return "Design et UX";
  if (text.includes("content") || text.includes("publish") || text.includes("publication")) return "Contenu et publication";

  return entry.category || "Connaissances SaaS";
}

function maturityFor(toolCount: number, observationCount: number, averageConfidence: number): GreenhouseMaturity {
  if (toolCount >= 5 || observationCount >= 10 || averageConfidence >= 0.86) return "arbre";
  if (toolCount >= 3 || observationCount >= 5 || averageConfidence >= 0.78) return "plante";
  if (toolCount >= 2 || observationCount >= 2) return "pousse";
  return "graine";
}

function mostFrequent(values: string[]): string {
  const counts = values.reduce<Record<string, number>>((acc, value) => {
    const key = value || "non classe";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "non classe";
}

function sharedTags(entries: ObservationMemoryEntry[]): string[] {
  const counts = entries.flatMap((entry) => entry.tags.map(normalize)).reduce<Record<string, number>>((acc, tag) => {
    acc[tag] = (acc[tag] ?? 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .filter(([, count]) => count >= Math.max(1, Math.ceil(entries.length / 2)))
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag)
    .slice(0, 8);
}

function buildSignals(cluster: Omit<GreenhouseCluster, "signals">): string[] {
  const signals: string[] = [];

  if (cluster.toolCount === 1) signals.push("Nouvelle graine de connaissance a surveiller.");
  if (cluster.toolCount >= 2) signals.push(`${cluster.toolCount} outils relies dans la meme zone.`);
  if (cluster.observationCount >= 3) signals.push(`${cluster.observationCount} observations accumulees.`);
  if (cluster.averageConfidence >= 0.78) signals.push("Confiance moyenne solide pour une prochaine decision.");
  if (cluster.maturity === "arbre") signals.push("Tendance mature : candidate a un Seed ou Harvest dedie.");

  return signals;
}

export function buildGreenhouse(entries: ObservationMemoryEntry[]): GreenhouseReport {
  const grouped = entries.reduce<Record<string, ObservationMemoryEntry[]>>((acc, entry) => {
    const title = clusterTitleFor(entry);
    acc[title] = [...(acc[title] ?? []), entry];
    return acc;
  }, {});

  const clusters = Object.entries(grouped).map(([title, clusterEntries]) => {
    const observationCount = clusterEntries.reduce((sum, entry) => sum + entry.observationCount, 0);
    const toolCount = clusterEntries.length;
    const averageConfidence = Number((clusterEntries.reduce((sum, entry) => sum + entry.averageConfidence, 0) / toolCount).toFixed(2));
    const firstObservedAt = clusterEntries.map((entry) => entry.firstObservedAt).sort()[0];
    const lastObservedAt = clusterEntries.map((entry) => entry.lastObservedAt).sort().at(-1) ?? firstObservedAt;
    const maturity = maturityFor(toolCount, observationCount, averageConfidence);
    const baseCluster = {
      id: createId("greenhouse"),
      title,
      maturity,
      observationCount,
      toolCount,
      firstObservedAt,
      lastObservedAt,
      averageConfidence,
      entries: clusterEntries.sort((a, b) => b.averageConfidence - a.averageConfidence),
      sharedTags: sharedTags(clusterEntries),
      dominantCategory: mostFrequent(clusterEntries.map((entry) => entry.category)),
    } satisfies Omit<GreenhouseCluster, "signals">;

    return {
      ...baseCluster,
      signals: buildSignals(baseCluster),
    };
  }).sort((a, b) => {
    const maturityRank: Record<GreenhouseMaturity, number> = { arbre: 4, plante: 3, pousse: 2, graine: 1 };
    return maturityRank[b.maturity] - maturityRank[a.maturity] || b.observationCount - a.observationCount;
  });

  return {
    generatedAt: new Date().toISOString(),
    clusters,
    totalEntries: entries.length,
    totalObservations: entries.reduce((sum, entry) => sum + entry.observationCount, 0),
  };
}
