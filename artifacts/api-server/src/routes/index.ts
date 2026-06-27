import { Router, type IRouter } from "express";
import healthRouter from "./health";
import agentsRouter from "./agents";
import postsRouter from "./posts";
import campaignsRouter from "./campaigns";
import connectorsRouter from "./connectors";
import settingsRouter from "./settings";
import dashboardRouter from "./dashboard";
import calendarRouter from "./calendar";
import generateRouter from "./generate";
import octopusRouter from "./octopus";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/agents", agentsRouter);
router.use("/posts", postsRouter);
router.use("/campaigns", campaignsRouter);
router.use("/connectors", connectorsRouter);
router.use("/settings", settingsRouter);
router.use("/dashboard", dashboardRouter);
router.use("/calendar", calendarRouter);
router.use("/generate", generateRouter);
router.use("/octopus", octopusRouter);

export default router;
