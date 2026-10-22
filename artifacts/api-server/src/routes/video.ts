import { Router } from "express";
import { artifactPath, videoCatalog } from "../publisher/video/render";
import { prepareVideoPackage, VideoError } from "../publisher/video/package";
const router = Router();
// Local file production only. Do not expose a compute or file proxy publicly.
router.use((req, res, next) => {
  if (
    !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
      req.socket.remoteAddress ?? "",
    ) ||
    req.headers["x-forwarded-for"]
  ) {
    res
      .status(403)
      .json({ status: "blocked", code: "LOCAL_VIDEO_ACCESS_REQUIRED" });
    return;
  }
  next();
});
router.get("/catalog", async (_req, res) => {
  res.json(await videoCatalog());
});
router.post("/prepare", (req, res) => {
  try {
    res.json({
      status: "prepared",
      videoPackage: prepareVideoPackage(req.body),
      publishingEnabled: false,
    });
  } catch (e) {
    res.status(422).json({
      status: "rejected",
      code: e instanceof VideoError ? e.code : "INVALID_VIDEO_PACKAGE",
      details: e instanceof VideoError ? e.details : [],
    });
  }
});
router.get("/artifacts/:id/:file", (req, res) => {
  try {
    const file = String(req.params.file),
      filename = artifactPath(String(req.params.id), file);
    res.setHeader("Cache-Control", "private, no-store");
    if (file === "video.mp4") res.attachment("publisher-video.mp4");
    res.sendFile(filename, (error) => {
      if (error && !res.headersSent)
        res
          .status(404)
          .json({ status: "missing", code: "VIDEO_ARTIFACT_NOT_FOUND" });
    });
  } catch {
    res.status(400).json({ status: "rejected", code: "INVALID_ARTIFACT_PATH" });
  }
});
export default router;
