import { Router } from "express";
import { loadMemorySourceSummaries } from "../services/notion-knowledge-provider";

const router = Router();

router.get("/", async (_req, res) => {
  const sources = await loadMemorySourceSummaries();
  return res.json({ sources });
});

export default router;
