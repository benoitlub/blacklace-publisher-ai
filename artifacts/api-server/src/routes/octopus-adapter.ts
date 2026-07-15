import { Router } from "express";
import {
  executePublisherAdapter,
  PUBLISHER_ADAPTER_CAPABILITIES,
  type OctopusAdapterEnvelope,
} from "../publisher/octopus-adapter";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    adapterId: "publisher",
    contract: "octopus-adapter-execution-v1",
    capabilities: PUBLISHER_ADAPTER_CAPABILITIES,
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

export default router;
