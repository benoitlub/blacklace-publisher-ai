import { Router } from "express";
import { artifactPath, studioCatalog } from "../publisher/studio/runtime";
const router = Router();
router.use((req, res, next) => {
  if (
    !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
      req.socket.remoteAddress ?? "",
    ) ||
    req.headers["x-forwarded-for"]
  ) {
    res
      .status(403)
      .json({ status: "blocked", code: "LOCAL_STUDIO_ACCESS_REQUIRED" });
    return;
  }
  next();
});
router.get("/catalog", async (_req, res) => res.json(await studioCatalog()));
router.get("/artifacts/:id/:file", (req, res) => {
  try {
    const file = String(req.params.file);
    res.setHeader("Cache-Control", "private, no-store");
    res.download(artifactPath(String(req.params.id), file), file, (error) => {
      if (error && !res.headersSent)
        res.status(404).json({ status: "missing" });
    });
  } catch {
    res.status(400).json({ status: "blocked", code: "INVALID_ARTIFACT_PATH" });
  }
});
export default router;
