import { Router } from "express";
import { resolveKnowledgePackage } from "../services/knowledge-package-resolver";

const router = Router();

router.get("/:slug", async (req, res) => {
  const requestedSlug = String(req.params.slug || "").trim();
  if (!requestedSlug) return res.status(400).json({ error: "Knowledge Pack slug is required" });

  try {
    const knowledge = await resolveKnowledgePackage([requestedSlug]);
    return res.json({
      version: 2,
      slug: knowledge.slug,
      verified: knowledge.verified,
      source: knowledge.source,
      sourceTitle: knowledge.items[0]?.title ?? null,
      fetchedAt: new Date().toISOString(),
      items: knowledge.items,
      prompt: knowledge.prompt,
      diagnostics: knowledge.diagnostics,
    });
  } catch (error) {
    return res.status(503).json({
      version: 2,
      slug: requestedSlug,
      verified: false,
      source: "mock",
      sourceTitle: null,
      fetchedAt: new Date().toISOString(),
      items: [],
      prompt: "",
      diagnostics: {
        connected: false,
        error: error instanceof Error ? error.message : "Knowledge Package resolver unavailable",
        totalItems: 0,
        matchedItems: 0,
        discoveredItems: 0,
        digestedItems: 0,
      },
    });
  }
});

export default router;
