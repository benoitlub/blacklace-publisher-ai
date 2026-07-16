import { Router } from "express";
import {
  executePublisherAdapter,
  PUBLISHER_ADAPTER_CAPABILITIES,
  type OctopusAdapterEnvelope,
} from "../publisher/octopus-adapter";
import {
  observeWithOctopus,
  type PublisherObservationInput,
} from "../publisher/octopus-observation";

const router = Router();
const DEFAULT_OCTOPUS_URL = "https://octopus-engine.onrender.com";

type AdapterTrace = {
  missionId: string | null;
  operationId: string | null;
  capability: string | null;
  contextId: string | null;
  source: string;
  status: "idle" | "received" | "running" | "ready" | "failed";
  producer: string | null;
  artifactCount: number;
  receivedAt: string | null;
  completedAt: string | null;
  latencyMs: number | null;
  error: string | null;
};

let latestTrace: AdapterTrace = {
  missionId: null,
  operationId: null,
  capability: null,
  contextId: null,
  source: "octopus",
  status: "idle",
  producer: null,
  artifactCount: 0,
  receivedAt: null,
  completedAt: null,
  latencyMs: null,
  error: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function envelopeTrace(value: unknown): Pick<AdapterTrace, "missionId" | "operationId" | "capability" | "contextId"> {
  const envelope = isRecord(value) ? value : {};
  const context = isRecord(envelope.context) ? envelope.context : {};
  const metadata = isRecord(context.metadata) ? context.metadata : {};
  const capabilities = Array.isArray(envelope.requiredCapabilities) ? envelope.requiredCapabilities : [];
  return {
    missionId: stringValue(envelope.missionId ?? envelope.id ?? envelope.operationId),
    operationId: stringValue(envelope.operationId ?? envelope.missionId ?? envelope.id),
    capability: stringValue(envelope.capability ?? envelope.action ?? capabilities[0] ?? metadata.requestedCapability),
    contextId: stringValue(context.id ?? envelope.contextId ?? envelope.parcelId ?? metadata.parcelId),
  };
}

function resultProducer(value: unknown): string | null {
  const result = isRecord(value) ? value : {};
  const output = isRecord(result.output) ? result.output : {};
  return stringValue(result.producer ?? result.provider ?? result.tool ?? output.producer ?? output.provider ?? output.tool);
}

function artifactCount(value: unknown): number {
  const result = isRecord(value) ? value : {};
  const output = isRecord(result.output) ? result.output : {};
  const candidates = result.artifacts ?? output.artifacts ?? output.harvests ?? result.harvests;
  return Array.isArray(candidates) ? candidates.length : (result.artifact || output.artifact ? 1 : 0);
}

function validObservation(value: unknown): PublisherObservationInput | null {
  if (!isRecord(value)) return null;
  if (typeof value.kind !== "string" || !value.kind.trim()) return null;
  if (typeof value.title !== "string" || !value.title.trim()) return null;

  const metrics = isRecord(value.metrics)
    ? Object.fromEntries(Object.entries(value.metrics).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1])))
    : undefined;
  const context = isRecord(value.context)
    ? Object.fromEntries(Object.entries(value.context).filter(([, item]) => item === null || ["string", "number", "boolean"].includes(typeof item))) as PublisherObservationInput["context"]
    : undefined;

  return {
    kind: value.kind.trim(),
    title: value.title.trim(),
    ...(typeof value.id === "string" && value.id.trim() ? { id: value.id.trim() } : {}),
    ...(typeof value.source === "string" && value.source.trim() ? { source: value.source.trim() } : {}),
    ...(typeof value.occurredAt === "string" && value.occurredAt.trim() ? { occurredAt: value.occurredAt.trim() } : {}),
    ...(metrics ? { metrics } : {}),
    ...(context ? { context } : {}),
    ...(Array.isArray(value.tags) ? { tags: value.tags.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) } : {}),
    ...(isRecord(value.metadata) ? { metadata: value.metadata } : {}),
  };
}

async function engineHealth() {
  const octopusUrl = (process.env.OCTOPUS_ENGINE_URL?.trim() || DEFAULT_OCTOPUS_URL).replace(/\/$/, "");
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${octopusUrl}/health`, { signal: controller.signal, cache: "no-store" });
    return { connected: response.ok, status: response.status, latencyMs: Date.now() - startedAt };
  } catch {
    return { connected: false, status: null, latencyMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timeout);
  }
}

router.get("/health", async (_req, res) => {
  const engine = await engineHealth();
  res.json({
    status: "ok",
    adapterId: "publisher",
    contracts: ["octopus-adapter-execution-v1", "universal-observation-knowledge-v1"],
    capabilities: PUBLISHER_ADAPTER_CAPABILITIES,
    observationBridge: true,
    engine,
    trace: latestTrace,
  });
});

router.get("/trace", (_req, res) => {
  res.json({ status: "ok", trace: latestTrace });
});

router.post("/execute", async (req, res) => {
  const startedAt = Date.now();
  const identity = envelopeTrace(req.body);
  latestTrace = {
    ...latestTrace,
    ...identity,
    source: "octopus",
    status: "received",
    producer: null,
    artifactCount: 0,
    receivedAt: new Date().toISOString(),
    completedAt: null,
    latencyMs: null,
    error: null,
  };
  try {
    latestTrace = { ...latestTrace, status: "running" };
    const result = await executePublisherAdapter(req.body as OctopusAdapterEnvelope);
    const failed = result.status === "failed";
    latestTrace = {
      ...latestTrace,
      status: failed ? "failed" : "ready",
      producer: resultProducer(result),
      artifactCount: artifactCount(result),
      completedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      error: failed ? stringValue(result.summary) : null,
    };
    return res.status(failed ? 422 : 200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Échec de l’adaptateur Publisher.";
    latestTrace = {
      ...latestTrace,
      status: "failed",
      completedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      error: message,
    };
    return res.status(500).json({ status: "failed", summary: message, output: {} });
  }
});

router.post("/observe", async (req, res) => {
  const observation = validObservation(req.body);
  if (!observation) {
    return res.status(400).json({
      status: "rejected",
      code: "INVALID_OBSERVATION",
      summary: "Publisher requires a neutral observation with kind and title.",
    });
  }

  try {
    const result = await observeWithOctopus(observation);
    return res.json(result);
  } catch (error) {
    return res.status(502).json({
      status: "failed",
      code: "OCTOPUS_UNAVAILABLE",
      summary: error instanceof Error ? error.message : "Octopus could not process the observation.",
    });
  }
});

export default router;
