import { Router, type IRouter } from "express";
import { AutonomousCurator, type CuratorContext, type CuratorSignal } from "../services/autonomous-curator.js";
import { CuratorPostgresStore } from "../services/curator-postgres-store.js";

const router: IRouter = Router();
const store = new CuratorPostgresStore();
const curator = new AutonomousCurator();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function parseSignal(value: unknown): CuratorSignal | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || !value.id.trim()) return null;
  if (typeof value.title !== "string" || !value.title.trim()) return null;
  if (typeof value.source !== "string" || !value.source.trim()) return null;
  return {
    id: value.id,
    title: value.title,
    source: value.source,
    capturedAt: typeof value.capturedAt === "string" ? value.capturedAt : new Date().toISOString(),
    ...(typeof value.kind === "string" ? { kind: value.kind as CuratorSignal["kind"] } : {}),
    ...(typeof value.summary === "string" ? { summary: value.summary } : {}),
    claims: stringArray(value.claims),
    tags: stringArray(value.tags),
    missionIds: stringArray(value.missionIds),
    evidenceRefs: stringArray(value.evidenceRefs),
    ...(typeof value.estimatedMonthlyCost === "number" ? { estimatedMonthlyCost: value.estimatedMonthlyCost } : {}),
    ...(typeof value.implementationEffort === "number" ? { implementationEffort: value.implementationEffort } : {}),
    ...(typeof value.platformRisk === "number" ? { platformRisk: value.platformRisk } : {}),
    ...(typeof value.lockInRisk === "number" ? { lockInRisk: value.lockInRisk } : {}),
  };
}

function parseContext(value: unknown): CuratorContext {
  if (!isRecord(value)) return { activeMissionIds: [], knownCapabilities: [], unresolvedNeeds: [] };
  return {
    activeMissionIds: stringArray(value.activeMissionIds),
    knownCapabilities: stringArray(value.knownCapabilities),
    unresolvedNeeds: stringArray(value.unresolvedNeeds),
  };
}

router.get("/status", async (_req, res, next) => {
  try {
    const records = await store.status();
    res.json({ status: "ready", mode: "postgres", inboxSize: records.length, records });
  } catch (error) {
    next(error);
  }
});

router.post("/signals", async (req, res, next) => {
  try {
    const signal = parseSignal(req.body);
    if (!signal) {
      res.status(400).json({ status: "failed", message: "A valid signal requires id, title and source." });
      return;
    }
    const record = await store.ingest(signal);
    res.status(202).json({ status: "captured", signalId: signal.id, ...record });
  } catch (error) {
    next(error);
  }
});

router.post("/run", async (req, res, next) => {
  try {
    const context = parseContext(isRecord(req.body) ? req.body.context : undefined);
    const limit = isRecord(req.body) && typeof req.body.limit === "number"
      ? Math.max(1, Math.min(20, Math.floor(req.body.limit)))
      : 10;
    const batch = await store.list(limit);
    const outcomes = curator.curate(batch, context);
    await store.apply(outcomes);
    const remaining = (await store.status()).length;
    res.json({
      status: "curated",
      processed: outcomes.length,
      remaining,
      candidates: outcomes.filter((outcome) => outcome.decision === "candidate-prepared"),
      outcomes,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
