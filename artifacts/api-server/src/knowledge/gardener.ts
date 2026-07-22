import { logger } from "../lib/logger";
import { listGlobalState, readGlobalState, writeGlobalState } from "../services/global-state";
import { harvestKnowledgeSource, type KnowledgeObservation, type KnowledgeSourceRecord } from "./harvesters";
import { synthesizeKnowledgePackage, type KnowledgePackage } from "./synthesizer";

const DEFAULT_INTERVAL_MS = 10 * 60_000;
const MAX_PARCELS_PER_TICK = 8;
let timer: NodeJS.Timeout | null = null;
let ticking = false;

export interface KnowledgeParcel {
  id: string;
  name: string;
  status?: "current" | "planned" | "archived";
  aliases?: string[];
  sourceIds?: string[];
  enabled?: boolean;
}

export interface KnowledgeGardenerStatus {
  running: boolean;
  intervalMs: number;
  lastTickAt: string | null;
  lastSuccessAt: string | null;
  parcelsSeen: number;
  sourcesHarvested: number;
  packagesWritten: number;
  lowestCoverage: number | null;
  errors: string[];
}

function intervalMs() {
  const configured = Number(process.env.KNOWLEDGE_GARDENER_INTERVAL_MS || DEFAULT_INTERVAL_MS);
  return Number.isFinite(configured) && configured >= 60_000 ? configured : DEFAULT_INTERVAL_MS;
}

function parcelKey(parcel: KnowledgeParcel) {
  return parcel.id;
}

async function observationsForParcel(parcelId: string): Promise<KnowledgeObservation[]> {
  const records = await listGlobalState<KnowledgeObservation>("knowledge-observations");
  return records.map((record) => record.value).filter((item) => item?.parcelId === parcelId);
}

async function harvestParcelSources(parcel: KnowledgeParcel): Promise<number> {
  const records = await listGlobalState<KnowledgeSourceRecord>("knowledge-sources");
  let harvested = 0;
  for (const record of records) {
    const source = record.value;
    if (!source || source.parcelId !== parcel.id) continue;
    if (parcel.sourceIds?.length && !parcel.sourceIds.includes(source.id)) continue;
    const observation = harvestKnowledgeSource(source);
    if (!observation) continue;
    const existing = await readGlobalState<KnowledgeObservation>("knowledge-observations", observation.id);
    if (existing?.value?.fingerprint === observation.fingerprint) continue;
    await writeGlobalState("knowledge-observations", observation.id, observation);
    harvested += 1;
  }
  return harvested;
}

async function prioritizedParcels(): Promise<KnowledgeParcel[]> {
  const records = await listGlobalState<KnowledgeParcel>("knowledge-parcels");
  const scored = await Promise.all(records
    .map((record) => record.value)
    .filter((parcel) => parcel?.enabled !== false && parcel?.status !== "archived")
    .map(async (parcel) => {
      const pack = await readGlobalState<KnowledgePackage>("knowledge-packages", parcelKey(parcel));
      return { parcel, coverage: pack?.value?.coverage ?? 0 };
    }));
  return scored.sort((a, b) => a.coverage - b.coverage || a.parcel.name.localeCompare(b.parcel.name)).slice(0, MAX_PARCELS_PER_TICK).map((item) => item.parcel);
}

export async function tickKnowledgeGardener(): Promise<KnowledgeGardenerStatus> {
  if (ticking) {
    const existing = await readGlobalState<KnowledgeGardenerStatus>("knowledge-gardener", "status").catch(() => null);
    return existing?.value ?? {
      running: true,
      intervalMs: intervalMs(),
      lastTickAt: null,
      lastSuccessAt: null,
      parcelsSeen: 0,
      sourcesHarvested: 0,
      packagesWritten: 0,
      lowestCoverage: null,
      errors: ["tick-already-running"],
    };
  }

  ticking = true;
  const status: KnowledgeGardenerStatus = {
    running: true,
    intervalMs: intervalMs(),
    lastTickAt: new Date().toISOString(),
    lastSuccessAt: null,
    parcelsSeen: 0,
    sourcesHarvested: 0,
    packagesWritten: 0,
    lowestCoverage: null,
    errors: [],
  };

  try {
    const parcels = await prioritizedParcels();
    for (const parcel of parcels) {
      status.parcelsSeen += 1;
      try {
        status.sourcesHarvested += await harvestParcelSources(parcel);
        const observations = await observationsForParcel(parcel.id);
        const previous = await readGlobalState<KnowledgePackage>("knowledge-packages", parcelKey(parcel));
        const knowledgePackage = synthesizeKnowledgePackage({
          parcelId: parcel.id,
          parcelName: parcel.name,
          observations,
          previous: previous?.value ?? null,
        });
        await writeGlobalState("knowledge-packages", parcelKey(parcel), knowledgePackage);
        await writeGlobalState("publisher-activity", `knowledge:${parcel.id}:${Date.now()}`, {
          kind: "knowledge-package-updated",
          label: knowledgePackage.coverage === 0
            ? `Publisher doit apprendre ${parcel.name}`
            : `Publisher connaît ${parcel.name} à ${knowledgePackage.coverage}%`,
          parcelId: parcel.id,
          parcelName: parcel.name,
          version: knowledgePackage.version,
          coverage: knowledgePackage.coverage,
          confidence: knowledgePackage.confidence,
          generatedAt: knowledgePackage.generatedAt,
        });
        status.packagesWritten += 1;
        status.lowestCoverage = status.lowestCoverage === null
          ? knowledgePackage.coverage
          : Math.min(status.lowestCoverage, knowledgePackage.coverage);
      } catch (error) {
        status.errors.push(`${parcel.id}:${error instanceof Error ? error.message : String(error)}`);
      }
    }
    status.lastSuccessAt = new Date().toISOString();
    await writeGlobalState("knowledge-gardener", "status", status);
    logger.info(status, "Knowledge Gardener tick completed");
    return status;
  } catch (error) {
    status.errors.push(error instanceof Error ? error.message : String(error));
    await writeGlobalState("knowledge-gardener", "status", status).catch(() => undefined);
    logger.error({ error }, "Knowledge Gardener tick failed");
    return status;
  } finally {
    ticking = false;
  }
}

export function startKnowledgeGardener(): void {
  if (timer || process.env.KNOWLEDGE_GARDENER_ENABLED === "false") return;
  const ms = intervalMs();
  void tickKnowledgeGardener();
  timer = setInterval(() => void tickKnowledgeGardener(), ms);
  timer.unref?.();
  logger.info({ intervalMs: ms }, "Knowledge Gardener started");
}
