import { loadMissions, type ClientMission, type MissionParcel } from "@/lib/missions";
import { findParcelByName, loadParcels } from "@/lib/parcels";

export interface GardenParcelReport {
  readonly parcel: MissionParcel;
  readonly totalMissions: number;
  readonly seedsCount: number;
  readonly wipCount: number;
  readonly harvestReadyCount: number;
  readonly recommendations: readonly string[];
}

export interface GardenReport {
  readonly generatedAt: string;
  readonly parcels: readonly GardenParcelReport[];
  readonly globalRecommendations: readonly string[];
}

const GARDEN_REPORT_STORAGE_KEY = "publisher-ai:garden-report";

export function runGardenWorker(): GardenReport {
  const missions = loadMissions();
  const report = createGardenReport(missions);
  saveGardenReport(report);
  return report;
}

export function loadGardenReport(): GardenReport | null {
  const raw = window.localStorage.getItem(GARDEN_REPORT_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    return isGardenReport(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveGardenReport(report: GardenReport): void {
  window.localStorage.setItem(GARDEN_REPORT_STORAGE_KEY, JSON.stringify(report));
}

function createGardenReport(missions: readonly ClientMission[]): GardenReport {
  const groupedMissions = groupByParcel(missions);
  const knownParcelNames = new Set<string>();
  const parcelReports = loadParcels().map((parcel) => {
    knownParcelNames.add(parcel.name);
    return createParcelReport(parcel.name, groupedMissions.get(parcel.name) ?? []);
  });

  for (const [parcel, parcelMissions] of groupedMissions.entries()) {
    if (!knownParcelNames.has(parcel)) {
      parcelReports.push(createParcelReport(parcel, parcelMissions));
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    parcels: parcelReports,
    globalRecommendations: missions.length === 0 ? ["Creer une premiere mission client."] : []
  };
}

function groupByParcel(missions: readonly ClientMission[]): Map<MissionParcel, ClientMission[]> {
  const grouped = new Map<MissionParcel, ClientMission[]>();

  for (const mission of missions) {
    const parcelName = findParcelByName(mission.parcel)?.name ?? mission.parcel;
    grouped.set(parcelName, [...(grouped.get(parcelName) ?? []), mission]);
  }

  return grouped;
}

function createParcelReport(parcel: MissionParcel, missions: readonly ClientMission[]): GardenParcelReport {
  const seeds = missions.flatMap((mission) => mission.octopusResponse?.proposedSeeds ?? mission.proposedSeeds);
  const seedsCount = seeds.filter((seed) => seed.status === "seed").length;
  const wipCount = seeds.filter((seed) => seed.status === "wip").length;
  const harvestReadyCount = seeds.filter((seed) => seed.status === "harvest-draft").length;
  const recommendations = createRecommendations(parcel, missions, seedsCount, wipCount);

  return {
    parcel,
    totalMissions: missions.length,
    seedsCount,
    wipCount,
    harvestReadyCount,
    recommendations
  };
}

function createRecommendations(
  parcel: MissionParcel,
  missions: readonly ClientMission[],
  seedsCount: number,
  wipCount: number
): string[] {
  const recommendations: string[] = [];

  if (seedsCount >= 1 && wipCount === 0) {
    recommendations.push("Promouvoir une graine en WIP.");
  }

  if (wipCount >= 1) {
    recommendations.push("Preparer une recolte.");
  }

  const isYaelMission = parcel === "Yael Bali" || missions.some((mission) => mission.intent.toLowerCase().includes("yael"));
  if (isYaelMission) {
    recommendations.push("Preparer un audit Facebook.");
    recommendations.push("Preparer une carte de visite.");
    recommendations.push("Preparer une campagne courte.");
  }

  return recommendations;
}

function isGardenReport(value: unknown): value is GardenReport {
  const report = value as Partial<GardenReport>;
  return (
    typeof report.generatedAt === "string" &&
    Array.isArray(report.parcels) &&
    Array.isArray(report.globalRecommendations)
  );
}
