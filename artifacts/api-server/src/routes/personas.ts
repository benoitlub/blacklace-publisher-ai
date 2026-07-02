import { Router } from "express";
import { loadPublisherPersonas } from "../services/notion-knowledge-provider";
import { logger } from "../lib/logger";

const router = Router();

router.get("/", async (_req, res) => {
  const personas = await loadPublisherPersonas();
  logger.info(
    {
      count: personas.length,
      sources: [...new Set(personas.map((persona) => persona.source))]
    },
    "GET /api/personas returned publisher personas"
  );
  return res.json({ personas });
});

export default router;
