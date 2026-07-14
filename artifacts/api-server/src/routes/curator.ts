import { Router, type IRouter } from "express";
import { AutonomousCurator, type CuratorContext, type CuratorSignal } from "../services/autonomous-curator.js";
import { CuratorSourceInbox } from "../services/curator-source-inbox.js";

const router: IRouter = Router();
const inbox = new CuratorSourceInbox();
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
  if (!isRecord(value)) {
    return { activeMissionIds: [], knownCapabilities: [], unresolvedNeeds: [] };
  }
  return {
    activeMissionIds: stringArray(value.activeMissionIds),
    knownCapabilities: stringArray(value.knownCapabilities),
    unresolvedNeeds: stringArray(value.unresolvedNeeds),
  };
}

router.get("/status", (_req, res) => {
  const records = inbox.list();
  res.json({
    status: "ready",
    mode: "bounded-in-memory",
    inboxSize: records.length,
    records: records.map((record) => ({
      signalId: record.signal.id,
      title: record.signal.title,
      clusterKey: record.clusterKey,
      duplicateCount: record.duplicateCount,
      sources: record.sources,
      expiresAt: record.expiresAt,
    })),
  });
});

router.post("/signals", (req, res) => {
  const signal = parseSignal(req.body);
  if (!signal) {
    res.status(400).json({ status: "failed", message: "A valid signal requires id, title and source." });
    return;
  }

  const record = inbox.ingest(signal);
  res.status(202).json({
    status: "captured",
    signalId: signal.id,
    clusterKey: record.clusterKey,
    duplicateCount: record.duplicateCount,
    expiresAt: record.expiresAt,
  });
});

router.post("/run", (req, res) => {
  const context = parseContext(isRecord(req.body) ? req.body.context : undefined);
  const limit = isRecord(req.body) && typeof req.body.limit === "number"
    ? Math.max(1, Math.min(20, Math.floor(req.body.limit)))
    : 10;

  const batch = inbox.takeBatch(limit);
  const outcomes = curator.curate(batch, context);

  for (const outcome of outcomes) {
    if (outcome.decision === "candidate-prepared" || outcome.decision === "knowledge-updated" || outcome.decision === "discarded") {
      inbox.remove(outcome.clusterKey);
    }
  }

  res.json({
    status: "curated",
    processed: outcomes.length,
    remaining: inbox.list().length,
    candidates: outcomes.filter((outcome) => outcome.decision === "candidate-prepared"),
    outcomes,
  });
});

export default router;
