import { Router } from "express";
import { loadPublisherPersonas } from "../services/notion-knowledge-provider";

const router = Router();

router.get("/", async (_req, res) => {
  const personas = await loadPublisherPersonas();
  return res.json({ personas });
});

export default router;
