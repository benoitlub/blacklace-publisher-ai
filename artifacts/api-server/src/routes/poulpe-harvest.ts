import { Router } from "express";
import { aiGateway } from "../services/ai-gateway";

const router = Router();

type PoulpeMission = {
  operationId?: string;
  title?: string;
  objective?: string;
  intent?: string;
  prompt?: string;
  parcelId?: string;
  seedId?: string;
  context?: {
    id?: string;
    label?: string;
    metadata?: Record<string, unknown>;
  };
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

router.post("/harvest", async (req, res) => {
  const mission = (req.body ?? {}) as PoulpeMission;
  const operationId = text(mission.operationId) || `poulpe_${Date.now()}`;
  const objective = text(mission.objective) || text(mission.intent) || text(mission.prompt);

  if (!objective) {
    return res.status(400).json({
      status: "rejected",
      operationId,
      error: "objective, intent or prompt is required",
    });
  }

  const title = text(mission.title) || "Récolte Publisher";
  const parcelId = text(mission.parcelId) || text(mission.context?.id) || "poulpe-fiction";
  const seedId = text(mission.seedId) || text(mission.context?.metadata?.["seedId"]);
  const universe = text(mission.context?.label) || text(mission.context?.metadata?.["knowledgeSlug"]) || title;

  const response = await aiGateway.generate({
    task: "text.summary",
    prompt: objective,
    system: [
      "Tu es Blacklace Publisher, curateur et préparateur de récoltes pour les applications Blacklace.",
      "Produis un livrable directement exploitable, structuré, concret et fidèle à la mission.",
      "Ne prétends jamais avoir exécuté une action externe qui n'a pas réellement été exécutée.",
    ].join(" "),
    universe,
    agent: "publisher",
    preferredProvider: "mistral",
    maxTokens: 1800,
    temperature: 0.6,
    metadata: {
      operationId,
      parcelId,
      seedId: seedId || undefined,
      source: "poulpe-fiction",
      ...(mission.context?.metadata ?? {}),
    },
  });

  if (!response.ok) {
    return res.status(502).json({
      status: "blocked",
      operationId,
      parcelId,
      seedId: seedId || null,
      provider: response.provider,
      error: response.error || "Publisher generation failed",
    });
  }

  return res.status(201).json({
    status: "completed",
    operationId,
    parcelId,
    seedId: seedId || null,
    title,
    completedAt: new Date().toISOString(),
    provider: response.provider,
    result: {
      output: {
        text: response.output,
        artifacts: [
          {
            title,
            content: response.output,
            mimeType: "text/markdown; charset=utf-8",
          },
        ],
      },
      usage: response.usage,
    },
  });
});

export default router;
