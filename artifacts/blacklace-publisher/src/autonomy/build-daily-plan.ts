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

function buildSurvivorTasks(report: GreenhouseReport): PublisherAutonomyTask[] {
  const mature = report.clusters.filter((cluster) => cluster.maturity === "plante" || cluster.maturity === "arbre");
  const strongest = mature[0] ?? report.clusters[0];

  if (!strongest) {
    return [task({
      kind: "observe",
      title: "Rassembler les créations déjà prêtes",
      detail: "Inventorier les livres, applications, pages et démonstrations existantes afin de choisir ce qui peut être proposé sans demander à Benoît de fabriquer une nouvelle offre.",
      suggestedTime: "matin",
      confidence: 0.88,
      targetHref: "/greenhouse",
      reducesHumanWork: true,
    })];
  }

  return [
    task({
      kind: "sell",
      title: `Préparer une récolte à partir de ${strongest.title}`,
      detail: "Produire un paquet prêt à valider : promesse factuelle, prix simple, page courte, publication, message de présentation et preuve visuelle. Ne pas demander à Benoît de démarcher ni de créer un service supplémentaire.",
      suggestedTime: "matin",
      confidence: 0.9,
      targetHref: "/greenhouse",
      status: "ready",
      reducesHumanWork: true,
    }),
    task({
      kind: "improve",
      title: "Réduire les frictions",
      detail: "Vérifier le lien, la compréhension en cinq secondes, la version mobile et l'appel à l'action de la création choisie. Préparer directement les corrections les plus petites et les plus utiles.",
      suggestedTime: "midi",
      confidence: 0.86,
      targetHref: "/greenhouse",
      reducesHumanWork: true,
    }),
    task({
      kind: "automate",
      title: "Préparer la diffusion sans ajouter une corvée",
      detail: "Transformer la récolte en éléments réutilisables et prêts à publier. Gérard prépare tout ce qu'il peut ; Benoît n'intervient que pour valider une action externe non autorisée.",
      suggestedTime: "soir",
      confidence: 0.84,
      targetHref: "/memory",
      reducesHumanWork: true,
    }),
  ];
}

function buildObservationTasks(entries: ObservationMemoryEntry[]): PublisherAutonomyTask[] {
  const staleEntries = entries
    .filter((entry) => daysSince(entry.lastObservedAt) >= 3)
    .sort((a, b) => daysSince(b.lastObservedAt) - daysSince(a.lastObservedAt))
    .slice(0, 1);

  return staleEntries.map((entry) => task({
    kind: "observe",
    title: `Réobserver ${entry.name}`,
    detail: `${entry.name} n'a pas été revu depuis ${daysSince(entry.lastObservedAt)} jour(s). Ne conserver cette veille que si elle peut améliorer une récolte existante aujourd'hui.`,
    suggestedTime: "soir",
    confidence: Math.min(0.88, 0.58 + daysSince(entry.lastObservedAt) * 0.03),
    targetHref: `/observatory?kind=${encodeURIComponent(entry.sourceKind)}&value=${encodeURIComponent(entry.sourceValue)}`,
    reducesHumanWork: true,
  }));
}

export function buildPublisherDailyPlan(entries = loadObservationMemory()): PublisherAutonomyPlan {
  const report = buildGreenhouse(entries);
  const survivalIndex = 20;
  const tasks = [
    ...buildSurvivorTasks(report),
    ...buildObservationTasks(entries),
    task({
      kind: "report",
      title: "Livrer un résultat visible aujourd'hui",
      detail: "Présenter ce que Gérard a réellement préparé, ce qui est prêt à être validé et le seul blocage éventuel. Aucun conseil vague, aucune nouvelle mission commerciale imposée à Benoît.",
      suggestedTime: "nuit",
      confidence: 0.92,
      targetHref: "/memory",
      reducesHumanWork: true,
    }),
  ].filter((item) => item.reducesHumanWork).slice(0, 5);

  const dailySignal = report.clusters.length
    ? `${report.clusters.length} groupe(s) en Serre. Priorité absolue : obtenir une récolte exploitable à partir de l'existant, sans ajouter de travail commercial à Benoît.`
    : "Mode Survivor : inventorier l'existant et préparer une première récolte sans créer une nouvelle corvée.";

  return {
    id: createId("autonomy-plan"),
    generatedAt: new Date().toISOString(),
    dateKey: dateKey(),
    mode: "survivor",
    survivalIndex,
    summary: "Gérard privilégie proposer l'existant, l'améliorer puis automatiser. Toute tâche qui ajoute du travail à Benoît est rejetée.",
    tasks,
    dailySignal,
  };
}
