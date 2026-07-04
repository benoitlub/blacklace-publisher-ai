import { Router } from "express";
import { listAgents } from "./agents";

const router = Router();

router.get("/", listAgents);

export default router;
