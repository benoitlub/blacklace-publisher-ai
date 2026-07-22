import { Router } from "express";
import { tickKnowledgeGardener, type KnowledgeParcel } from "../knowledge/gardener";
import type { KnowledgeSourceRecord } from "../knowledge/harvesters";
import type { KnowledgePackage } from "../knowledge/synthesizer";
import { listGlobalState, readGlobalState, writeGlobalState } from "../services/global-state";

const router = Router();

router.post("/parcels", async (req, res) => {
  try {
    const parcel = req.body as KnowledgeParcel;
    if (!parcel?.id || !parcel?.name) return res.status(400).json({ error: "parcel.id and parcel.name are required" });
    const record = await writeGlobalState("knowledge-parcels", parcel.id, {
      ...parcel,
      status: parcel.status ?? "current",
      enabled: parcel.enabled !== false,
    });
    return res.status(201).json(record);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Parcel registration failed" });
  }
});

router.post("/sources", async (req, res) => {
  try {
    const source = req.body as KnowledgeSourceRecord;
    if (!source?.id || !source?.parcelId || !source?.kind) {
      return res.status(400).json({ error: "source.id, source.parcelId and source.kind are required" });
    }
    const record = await writeGlobalState("knowledge-sources", source.id, source);
    return res.status(201).json(record);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Source registration failed" });
  }
});

router.get("/status", async (_req, res) => {
  const status = await readGlobalState("knowledge-gardener", "status");
  return res.json(status?.value ?? { running: false, lastTickAt: null });
});

router.post("/tick", async (_req, res) => {
  return res.json(await tickKnowledgeGardener());
});

router.get("/packages", async (_req, res) => {
  const records = await listGlobalState<KnowledgePackage>("knowledge-packages");
  return res.json(records.map((record) => record.value));
});

router.get("/packages/:parcelId", async (req, res) => {
  const record = await readGlobalState<KnowledgePackage>("knowledge-packages", req.params.parcelId);
  if (!record) return res.status(404).json({ error: "Knowledge Package not found" });
  return res.json(record.value);
});

router.get("/contract", (_req, res) => res.json({
  version: 1,
  constitutionalRule: "Publisher must not remain ignorant of a known parcel.",
  flow: ["knowledge-parcels", "knowledge-sources", "harvesters", "knowledge-observations", "synthesizer", "knowledge-packages"],
  sourceKinds: ["notion", "instagram", "youtube", "website", "document", "github"],
  invariant: "Harvesters normalize; Synthesizer packages; Gardener prioritizes knowledge gaps.",
}));

export default router;
