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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
  });
});

router.post("/execute", async (req, res) => {
  try {
    const result = await executePublisherAdapter(req.body as OctopusAdapterEnvelope);
    return res.status(result.status === "failed" ? 422 : 200).json(result);
  } catch (error) {
    return res.status(500).json({
      status: "failed",
      summary: error instanceof Error ? error.message : "Échec de l’adaptateur Publisher.",
      output: {},
    });
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
