import { Router } from "express";
import { loadPublisherLoopSnapshot, savePublisherLoopSnapshot } from "../services/publisher-loop-store";

const router = Router();

router.get("/", (_req, res) => {
  return res.json(loadPublisherLoopSnapshot());
});

router.put("/", (req, res) => {
  return res.json(savePublisherLoopSnapshot(req.body));
});

export default router;
