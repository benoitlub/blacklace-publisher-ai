import { Router } from "express";
import { digestObservation, listKnowledge, recordKnowledgeUse, selectKnowledgeForMission } from "../services/knowledge-digestion";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const items = await listKnowledge();
    return res.json({ count: items.length, items });
  } catch (error) {
    return res.status(503).json({ error: error instanceof Error ? error.message : "Knowledge digestion unavailable" });
  }
});

router.post("/digest", async (req, res) => {
  if (!req.body || typeof req.body !== "object" || !req.body.title || !req.body.summary || !req.body.source) {
    return res.status(400).json({ error: "title, summary and source are required" });
  }
  try {
    return res.status(202).json(await digestObservation(req.body));
  } catch (error) {
    return res.status(503).json({ error: error instanceof Error ? error.message : "Digestion failed" });
  }
});

router.post("/select", async (req, res) => {
  try {
    const items = await selectKnowledgeForMission(req.body || {});
    return res.json({ count: items.length, items });
  } catch (error) {
    return res.status(503).json({ error: error instanceof Error ? error.message : "Knowledge selection failed" });
  }
});

router.post("/:id/use", async (req, res) => {
  if (!req.body?.parcelId) return res.status(400).json({ error: "parcelId is required" });
  try {
    const item = await recordKnowledgeUse(req.params.id, String(req.body.parcelId), Boolean(req.body.successful));
    if (!item) return res.status(404).json({ error: "Knowledge item not found" });
    return res.json(item);
  } catch (error) {
    return res.status(503).json({ error: error instanceof Error ? error.message : "Knowledge use could not be recorded" });
  }
});

router.post("/seed/web-harvest", async (_req, res) => {
  try {
    const observations = [
      {
        id: "movento-web-design-patterns",
        title: "Movento — patterns de landing pages premium",
        summary: "Source de patterns visuels et de structures de landing pages à adapter, sans copier les prompts propriétaires.",
        kind: "pattern",
        categories: ["ui-ux", "landing-pages", "branding"],
        expertises: ["web-design", "landing-page", "branding", "conversion"],
        tags: ["saas", "fintech", "responsive", "cta"],
        confidence: 0.75,
        source: { label: "Movento", url: "https://movento.dev" },
        activationRules: { missionTypes: ["landing-page", "campaign"], artifactTypes: ["landing-page"], audienceTags: ["saas", "fintech"], expertises: ["web-design", "branding"] },
      },
      {
        id: "viral-carousel-structure",
        title: "Structure de carrousel viral dépolluée",
        summary: "Image forte, affirmation vérifiable, idée simple, preuve accessible et CTA, sans faux chiffres ni claims invérifiables.",
        kind: "technique",
        categories: ["social", "copywriting", "content-marketing"],
        expertises: ["copywriting", "social-media", "fact-checking"],
        tags: ["instagram", "linkedin", "carousel"],
        confidence: 0.8,
        source: { label: "Moisson web — campagnes virales observées" },
        activationRules: { missionTypes: ["social-campaign"], artifactTypes: ["social-post", "social-visual"], audienceTags: [], expertises: ["copywriting", "social-media"] },
      },
      {
        id: "model-routing-by-cost-and-quality",
        title: "Routage de modèles par coût, qualité et risque",
        summary: "La méthode appartient à Octopus ; les modèles externes restent des greffons interchangeables choisis selon la mission.",
        kind: "workflow",
        categories: ["ai", "automation", "architecture"],
        expertises: ["ai-routing", "cost-control", "prompt-engineering"],
        tags: ["mistral", "qwen", "deepseek", "llama"],
        confidence: 0.8,
        source: { label: "Moisson web — architectures IA économiques" },
        activationRules: { missionTypes: ["generation", "analysis"], artifactTypes: [], audienceTags: [], expertises: ["ai-routing", "cost-control"] },
      },
      {
        id: "tool-action-via-mcp",
        title: "Les assistants doivent déclencher des outils, pas seulement converser",
        summary: "Signal de marché en faveur de greffons MCP et connecteurs actionnables, tout en masquant la plomberie à l’utilisateur final.",
        kind: "pattern",
        categories: ["automation", "connectors", "ux"],
        expertises: ["mcp", "workflow-design", "product-ux"],
        tags: ["mcp", "connectors", "tool-use"],
        confidence: 0.7,
        source: { label: "Moisson web — outils créatifs MCP" },
        activationRules: { missionTypes: ["automation", "production"], artifactTypes: [], audienceTags: [], expertises: ["workflow-design"] },
      }
    ];
    const results = [];
    for (const observation of observations) results.push(await digestObservation(observation as never));
    return res.json({ count: results.length, results });
  } catch (error) {
    return res.status(503).json({ error: error instanceof Error ? error.message : "Seed digestion failed" });
  }
});

export default router;
