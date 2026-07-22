import { Router } from "express";
import { produceDeliverable } from "../production/adapter";
import { buildProductionRequest, type DeliverableKind } from "../production/producer";
import { registerDeliverable } from "../production/registry";
import type { KnowledgePackage } from "../knowledge/synthesizer";
import { listGlobalState, readGlobalState, writeGlobalState } from "../services/global-state";

const router = Router();
const kinds: DeliverableKind[] = ["instagram-post", "landing-page", "newsletter", "documentation"];

async function generateOne(knowledge: KnowledgePackage, kind: DeliverableKind) {
  const request = buildProductionRequest(knowledge, kind);
  const deliverable = produceDeliverable(request);
  return registerDeliverable(request, deliverable);
}

async function prepareHarvest(knowledge: KnowledgePackage) {
  const assets = [];
  for (const kind of kinds) assets.push(await generateOne(knowledge, kind));

  const harvest = {
    id: `harvest:${knowledge.parcelId}:${knowledge.version}`,
    parcelId: knowledge.parcelId,
    parcelName: knowledge.parcelName,
    knowledgePackageVersion: knowledge.version,
    status: "ready",
    assetCount: assets.length,
    assets: assets.map((record: any) => record.value ?? record),
    preparedAt: new Date().toISOString(),
  };
  await writeGlobalState("harvests", harvest.id, harvest);
  await writeGlobalState("publisher-activity", `harvest:${knowledge.parcelId}:${Date.now()}`, {
    kind: "harvest-ready",
    label: `Récolte prête pour ${knowledge.parcelName}`,
    parcelId: knowledge.parcelId,
    assetCount: assets.length,
    preparedAt: harvest.preparedAt,
  });
  return harvest;
}

router.post("/generate", async (req, res) => {
  try {
    const parcelId = String(req.body?.parcelId ?? "").trim();
    const kind = String(req.body?.kind ?? "documentation") as DeliverableKind;
    if (!parcelId) return res.status(400).json({ error: "parcelId is required" });
    if (!kinds.includes(kind)) return res.status(400).json({ error: `Unsupported kind: ${kind}` });

    const knowledge = await readGlobalState<KnowledgePackage>("knowledge-packages", parcelId);
    if (!knowledge?.value) return res.status(404).json({ error: "Knowledge Package not found" });

    return res.status(201).json(await generateOne(knowledge.value, kind));
  } catch (error) {
    return res.status(422).json({ error: error instanceof Error ? error.message : "Deliverable generation failed" });
  }
});

router.post("/prepare-all", async (req, res) => {
  try {
    const parcelId = String(req.body?.parcelId ?? "").trim();
    const packages = parcelId
      ? [await readGlobalState<KnowledgePackage>("knowledge-packages", parcelId)].filter(Boolean)
      : await listGlobalState<KnowledgePackage>("knowledge-packages");

    const harvests = [];
    const skipped = [];
    for (const record of packages) {
      const knowledge = record?.value;
      if (!knowledge) continue;
      if (knowledge.status === "empty" || knowledge.coverage <= 0) {
        skipped.push({ parcelId: knowledge.parcelId, reason: "knowledge-package-empty" });
        continue;
      }
      harvests.push(await prepareHarvest(knowledge));
    }

    return res.status(201).json({ status: "completed", harvests, skipped });
  } catch (error) {
    return res.status(422).json({ error: error instanceof Error ? error.message : "Harvest preparation failed" });
  }
});

router.get("/harvests", async (_req, res) => {
  const records = await listGlobalState("harvests");
  return res.json(records.map((record) => record.value));
});

router.get("/", async (_req, res) => {
  const records = await listGlobalState("deliverables");
  return res.json(records.map((record) => record.value));
});

export default router;
