import { Router } from "express";
import { produceDeliverable } from "../production/adapter";
import { buildProductionRequest, type DeliverableKind } from "../production/producer";
import { registerDeliverable } from "../production/registry";
import type { KnowledgePackage } from "../knowledge/synthesizer";
import { listGlobalState, readGlobalState } from "../services/global-state";

const router = Router();
const kinds: DeliverableKind[] = ["instagram-post", "landing-page", "newsletter", "documentation"];

router.post("/generate", async (req, res) => {
  try {
    const parcelId = String(req.body?.parcelId ?? "").trim();
    const kind = String(req.body?.kind ?? "documentation") as DeliverableKind;
    if (!parcelId) return res.status(400).json({ error: "parcelId is required" });
    if (!kinds.includes(kind)) return res.status(400).json({ error: `Unsupported kind: ${kind}` });

    const knowledge = await readGlobalState<KnowledgePackage>("knowledge-packages", parcelId);
    if (!knowledge?.value) return res.status(404).json({ error: "Knowledge Package not found" });

    const request = buildProductionRequest(knowledge.value, kind);
    const deliverable = produceDeliverable(request);
    const record = await registerDeliverable(request, deliverable);
    return res.status(201).json(record);
  } catch (error) {
    return res.status(422).json({ error: error instanceof Error ? error.message : "Deliverable generation failed" });
  }
});

router.get("/", async (_req, res) => {
  const records = await listGlobalState("deliverables");
  return res.json(records.map((record) => record.value));
});

export default router;
