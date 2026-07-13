import { Router } from "express";
import { sendMissionToOctopus, checkOctopusHealth } from "../octopus/octopus-client";
import { GraftManager } from "../octopus/grafts/graft-manager";
import { localPublisherGreenhouseResource } from "../octopus/grafts/publisher-greenhouse-resource";
import type { GraftRequest } from "../octopus/grafts/types";

const router = Router();
const graftManager = new GraftManager();

type PublisherMissionRequest = {
  readonly text?: unknown;
  readonly title?: unknown;
  readonly objective?: unknown;
  readonly workspaceId?: unknown;
  readonly userId?: unknown;
  readonly context?: unknown;
  readonly requiredCapabilities?: unknown;
  readonly authorizedResources?: unknown;
  readonly authorize?: unknown;
  readonly operationId?: unknown;
  readonly parcelId?: unknown;
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "")
    : [];
}

router.get("/health", async (req, res) => {
  try {
    const engine = await checkOctopusHealth();
    return res.status(200).json({
      status: "connected",
      transport: "http",
      engine,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Octopus Engine indisponible";
    req.log.warn({ errorCode: message.split(":")[0] }, "octopus:health:error");
    return res.status(503).json({ status: "unavailable", transport: "http", error: message });
  }
});

router.post("/mission", async (req, res) => {
  const body = req.body as PublisherMissionRequest;
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const objective = typeof body.objective === "string" ? body.objective.trim() : text;

  if (!objective) {
    return res.status(400).json({
      error: "Le champ `text` ou `objective` est requis et ne peut pas être vide.",
    });
  }

  const operationId =
    typeof body.operationId === "string" && body.operationId.trim()
      ? body.operationId.trim()
      : `publisher_${Date.now()}`;

  const parcelId =
    typeof body.parcelId === "string" && body.parcelId.trim()
      ? body.parcelId.trim()
      : typeof body.workspaceId === "string" && body.workspaceId.trim()
        ? body.workspaceId.trim()
        : "blacklace-publisher";

  const context = body.context && typeof body.context === "object"
    ? body.context as Record<string, unknown>
    : {};

  const payload = {
    operationId,
    title:
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim()
        : "Mission Publisher",
    objective,
    prompt: text || objective,
    context: {
      id: parcelId,
      label: "Blacklace Publisher",
      objective,
      metadata: {
        owner: "blacklace-publisher",
        userId: typeof body.userId === "string" ? body.userId : null,
        ...context,
      },
    },
    parcelId,
    requiredCapabilities: stringArray(body.requiredCapabilities),
    authorizedResources: stringArray(body.authorizedResources),
    authorize: stringArray(body.authorize),
    authorizationPolicy: {
      internalWork: "allowed",
      externalAction: "requires-human-approval",
    },
  };

  try {
    const result = await sendMissionToOctopus(payload);
    return res.status(200).json({
      transport: "http",
      engineUrl: process.env["OCTOPUS_ENGINE_URL"] || "https://octopus-engine.onrender.com",
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur interne inconnue";
    const isClientError = /required|invalid|unknown|missing/i.test(message);

    req.log.warn(
      { errorCode: message.split(":")[0], isClientError },
      "octopus:mission:error",
    );

    return res.status(isClientError ? 400 : 502).json({
      error: message,
      transport: "http",
    });
  }
});

router.post("/grafts/select", (req, res) => {
  const body = req.body as Partial<GraftRequest>;
  const requiredCapabilities = Array.isArray(body.requiredCapabilities)
    ? body.requiredCapabilities.filter(
        (capability): capability is string =>
          typeof capability === "string" && capability.trim() !== "",
      )
    : [];

  if (!requiredCapabilities.length) {
    return res.status(400).json({
      error: "Le champ `requiredCapabilities` doit contenir au moins une capacité.",
    });
  }

  const result = graftManager.selectGrafts(localPublisherGreenhouseResource, {
    missionId: typeof body.missionId === "string" ? body.missionId : undefined,
    requiredCapabilities,
    preferredTools: Array.isArray(body.preferredTools)
      ? body.preferredTools.filter((tool): tool is string => typeof tool === "string")
      : undefined,
    maxGrafts: typeof body.maxGrafts === "number" ? body.maxGrafts : undefined,
  });

  return res.status(200).json(result);
});

export default router;
