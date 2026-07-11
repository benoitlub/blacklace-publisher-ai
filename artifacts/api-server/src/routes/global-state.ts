import { Router } from "express";
import { listGlobalState, readGlobalState, writeGlobalState } from "../services/global-state";

const router = Router();

router.get("/:namespace", async (req, res) => {
  try {
    return res.json(await listGlobalState(req.params.namespace));
  } catch (error) {
    return res.status(503).json({ error: error instanceof Error ? error.message : "Global state unavailable" });
  }
});

router.get("/:namespace/:key", async (req, res) => {
  try {
    const record = await readGlobalState(req.params.namespace, req.params.key);
    if (!record) return res.status(404).json({ error: "Global state not found" });
    return res.json(record);
  } catch (error) {
    return res.status(503).json({ error: error instanceof Error ? error.message : "Global state unavailable" });
  }
});

router.put("/:namespace/:key", async (req, res) => {
  if (!req.body || typeof req.body !== "object") return res.status(400).json({ error: "JSON body required" });
  try {
    return res.json(await writeGlobalState(req.params.namespace, req.params.key, req.body));
  } catch (error) {
    return res.status(503).json({ error: error instanceof Error ? error.message : "Global state unavailable" });
  }
});

export default router;
