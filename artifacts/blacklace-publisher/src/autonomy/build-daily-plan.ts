import type { PublisherAutonomyPlan, PublisherAutonomyTask } from "@/models/autonomy";
import type { GreenhouseReport } from "@/models/greenhouse";
import type { ObservationMemoryEntry } from "@/models/observation-memory";
import { buildGreenhouse } from "@/knowledge/build-greenhouse";
import { loadObservationMemory } from "@/memory/observation-memory";

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function dateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function daysSince(value: string): number {
  const diff = Date.now() - new Date(value).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

function task(input: Omit<PublisherAutonomyTask, "id" | "status"> & { status?: PublisherAutonomyTask["status"] }): PublisherAutonomyTask {
  return {
    id: createId("autonomy-task"),
    status: input.status ?? "planned",
    ...input,
  };
}

function buildObservationTasks(entries: ObservationMemoryEntry[]): PublisherAutonomyTask[] {
  const staleEntries = entries
    .filter((entry) => daysSince(entry.lastObservedAt) >= 3)
    .sort((a, b) => daysSince(b.lastObservedAt) - daysSince(a.lastObservedAt))
    .slice(0, 3);

  if (!entries.length) {
    return [task({
      kind: "observe",
      title: "Nourrir le Radar",
      detail: "Aucune observation en mémoire. Coller une petite liste brute de SaaS, dépôts GitHub ou outils IA à scanner.",
      suggestedTime: "matin",
      confidence: 0.72,
      targetHref: "/radar",
    })];
  }

  return staleEntries.map((entry) => task({
    kind: "observe",
    title: `Réobserver ${entry.name}`,
    detail: `${entry.name} n'a pas été revu depuis ${daysSince(entry.lastObservedAt)} jour(s). Une nouvelle observation peut détecter une évolution.`,
    suggestedTime: "matin",
    confidence: Math.min(0.92, 0.62 + daysSince(entry.lastObservedAt) * 0.04),
    targetHref: `/observatory?kind=${encodeURIComponent(entry.sourceKind)}&value=${encodeURIComponent(entry.sourceValue)}`,
  }));
}

function buildGreenhouseTasks(report: GreenhouseReport): PublisherAutonomyTask[] {
  const tasks: PublisherAutonomyTask[] = [];
  const mature = report.clusters.filter((cluster) => cluster.maturity === "plante" || cluster.maturity === "arbre");
  const seeds = report.clusters.filter((cluster) => cluster.maturity === "graine");

  if (report.clusters.length >= 2) {
    tasks.push(task({
      kind: "compare",
      title: "Comparer les familles actives",
      detail: `${report.clusters.length} groupes existent dans la Serre. Rechercher les proximités et doublons avant de proposer une action.`,
      suggestedTime: "midi",
      confidence: 0.76,
      targetHref: "/greenhouse",
    }));
  }

  if (mature.length) {
    tasks.push(task({
      kind: "greenhouse",
      title: `Identifier un Seed dans ${mature[0].title}`,
      detail: `${mature[0].title} atteint le niveau ${mature[0].maturity}. Ce groupe peut mériter une graine structurée.`,
      suggestedTime: "soir",
      confidence: 0.82,
      targetHref: "/greenhouse",
    }));
  }

  if (seeds.length) {
    tasks.push(task({
      kind: "review",
      title: "Surveiller les nouvelles graines",
      detail: `${seeds.length} groupe(s) sont encore au stade graine. Les laisser pousser avant décision forte.`,
      suggestedTime: "soir",
      confidence: 0.68,
      targetHref: "/greenhouse",
    }));
  }

  return tasks;
}

export function buildPublisherDailyPlan(entries = loadObservationMemory()): PublisherAutonomyPlan {
  const report = buildGreenhouse(entries);
  const tasks = [
    ...buildObservationTasks(entries),
    ...buildGreenhouseTasks(report),
    task({
      kind: "report",
      title: "Préparer le rapport du jour",
      detail: "Résumer ce qui a été observé, ce qui a mûri dans la Serre et ce qui mérite validation humaine.",
      suggestedTime: "nuit",
      confidence: 0.74,
      targetHref: "/memory",
    }),
  ].slice(0, 7);

  const dailySignal = report.clusters.length
    ? `${report.clusters.length} groupe(s) en Serre, ${report.totalObservations} observation(s) mémorisée(s).`
    : "La Serre attend ses premières observations.";

  return {
    id: createId("autonomy-plan"),
    generatedAt: new Date().toISOString(),
    dateKey: dateKey(),
    mode: "local",
    summary: "Planning local de veille : Publisher prépare, l'humain valide, Octopus Engine reste intact.",
    tasks,
    dailySignal,
  };
}
