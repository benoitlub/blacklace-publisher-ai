import type { Request, Response } from "express";
import { Router } from "express";
import { listGlobalState } from "../services/global-state";

const router = Router();

interface ObservationTool {
  id?: string;
  name?: string;
  title?: string;
  description?: string;
  category?: string;
  roles?: string[];
  capabilities?: string[];
  recipe?: string;
  url?: string;
  confidence?: number;
  source?: string;
}

router.get("/:seedId", async (req: Request, res: Response) => {
  try {
    const deliverable = normalize(String(req.query.deliverable || ""));
    const rawSeedId = Array.isArray(req.params.seedId) ? req.params.seedId[0] : req.params.seedId;
    const seedId = normalize(rawSeedId);
    const records = await listGlobalState<ObservationTool | ObservationTool[]>("observations");
    const observations = records.flatMap((record) => Array.isArray(record.value) ? record.value : [record.value]);
    const ranked = observations
      .map((tool) => ({ tool, score: scoreTool(tool, seedId, deliverable) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map(({ tool, score }) => ({
        id: tool.id || normalize(tool.name || tool.title || "tool").replace(/\s+/g, "-"),
        name: tool.name || tool.title || "Outil observé",
        role: bestRole(tool, deliverable),
        reason: tool.description || `Outil observé pertinent pour ${deliverable || seedId}`,
        recipe: tool.recipe || "À préciser depuis l'Observatoire",
        capabilities: tool.capabilities || tool.roles || [],
        url: tool.url || null,
        confidence: Math.min(0.99, Math.max(0.4, tool.confidence ?? score / 20)),
        source: tool.source || "observatory-memory",
      }));

    return res.json({
      version: 1,
      seedId: req.params.seedId,
      deliverable: String(req.query.deliverable || ""),
      generatedAt: new Date().toISOString(),
      tools: ranked,
      source: "publisher-global-observation-memory",
    });
  } catch (error) {
    return res.status(503).json({ error: error instanceof Error ? error.message : "Tool Pack unavailable" });
  }
});

function scoreTool(tool: ObservationTool, seedId: string, deliverable: string): number {
  const haystack = normalize([
    tool.name,
    tool.title,
    tool.description,
    tool.category,
    ...(tool.roles || []),
    ...(tool.capabilities || []),
    tool.recipe,
  ].filter(Boolean).join(" "));
  let score = 1;
  for (const token of [...seedId.split(" "), ...deliverable.split(" ")].filter((token) => token.length > 2)) {
    if (haystack.includes(token)) score += 4;
  }
  const families: Record<string, string[]> = {
    video: ["video", "kling", "runway", "animation", "reel", "tiktok"],
    voice: ["voice", "voix", "audio", "elevenlabs", "tts"],
    visual: ["image", "visuel", "canva", "design", "illustration"],
    publish: ["metricool", "publication", "schedule", "instagram", "social"],
    landing: ["landing", "html", "site", "page", "web"],
  };
  for (const [family, terms] of Object.entries(families)) {
    if (deliverable.includes(family) && terms.some((term) => haystack.includes(term))) score += 12;
  }
  return score;
}

function bestRole(tool: ObservationTool, deliverable: string): string {
  return tool.roles?.[0] || tool.category || deliverable || "production";
}

function normalize(value: string): string {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export default router;
