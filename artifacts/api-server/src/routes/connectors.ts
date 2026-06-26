import { Router } from "express";
import { fetchBlacklaceKnowledgeWithDiagnostics } from "../services/notion";

const router = Router();

interface ConnectorDef {
  name: string;
  displayName: string;
  description: string;
  requiredVars: string[];
}

const CONNECTOR_DEFS: ConnectorDef[] = [
  {
    name: "ai-provider",
    displayName: "AI Provider",
    description: "Moteur IA interchangeable : mock, Mistral, OpenAI, Anthropic, Gemini, Ollama, OpenRouter ou API personnalisée.",
    requiredVars: ["AI_PROVIDER", "AI_API_KEY", "AI_MODEL"],
  },
  {
    name: "knowledge-source",
    displayName: "Knowledge Source",
    description: "Source de connaissance interchangeable : Notion, Markdown, GitHub, Drive, PDF, DOCX ou API client.",
    requiredVars: ["KNOWLEDGE_CONNECTOR"],
  },
  {
    name: "notion",
    displayName: "Notion",
    description: "Connecteur de base de connaissances. Optionnel : Notion devient une source parmi d'autres.",
    requiredVars: ["NOTION_API_KEY", "NOTION_DATABASE_ID"],
  },
  {
    name: "mistral",
    displayName: "Mistral AI",
    description: "Fournisseur IA optionnel. Le système peut aussi fonctionner avec d'autres providers.",
    requiredVars: ["MISTRAL_API_KEY"],
  },
  {
    name: "github",
    displayName: "GitHub",
    description: "Lecture des dépôts, changelogs, builds et assets pour alimenter la mémoire éditoriale.",
    requiredVars: ["GITHUB_TOKEN", "GITHUB_REPO"],
  },
  {
    name: "meta",
    displayName: "Meta (Instagram / Facebook)",
    description: "Publication sur Instagram et Facebook via Meta Graph API. Non activé en V1.",
    requiredVars: ["META_ACCESS_TOKEN", "META_PAGE_ID", "META_IG_USER_ID"],
  },
  {
    name: "tiktok",
    displayName: "TikTok",
    description: "Publication de vidéos et contenus courts via TikTok Content Posting API. Non activé en V1.",
    requiredVars: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "TIKTOK_ACCESS_TOKEN"],
  },
  {
    name: "kdp",
    displayName: "KDP (Amazon)",
    description: "Suivi éditorial et reporting autour des publications Kindle Direct Publishing. Non activé en V1.",
    requiredVars: ["KDP_ACCESS_KEY", "KDP_SECRET_KEY", "KDP_SELLER_ID"],
  },
];

function getConnectorStatus(def: ConnectorDef): "connected" | "disconnected" | "mock" {
  if (def.name === "ai-provider") {
    return process.env.AI_PROVIDER && process.env.AI_PROVIDER !== "mock" ? "connected" : "mock";
  }

  if (def.name === "knowledge-source") {
    return process.env.KNOWLEDGE_CONNECTOR && process.env.KNOWLEDGE_CONNECTOR !== "mock" ? "connected" : "mock";
  }

  const allSet = def.requiredVars.every((v) => !!process.env[v]);
  if (allSet) return "connected";
  const someSet = def.requiredVars.some((v) => !!process.env[v]);
  if (someSet) return "disconnected";
  return "mock";
}

router.get("/", (_req, res) => {
  const connectors = CONNECTOR_DEFS.map((def) => ({
    name: def.name,
    displayName: def.displayName,
    description: def.description,
    status: getConnectorStatus(def),
    requiredVars: def.requiredVars,
    isConfigured: def.requiredVars.every((v) => !!process.env[v]),
    lastTestedAt: null,
  }));
  return res.json(connectors);
});

router.post("/:name/test", async (req, res) => {
  const { name } = req.params;
  const def = CONNECTOR_DEFS.find((d) => d.name === name);
  if (!def) return res.status(404).json({ error: "Connector not found" });

  const isConfigured = def.requiredVars.every((v) => !!process.env[v]);
  const testedAt = new Date().toISOString();

  if (name === "ai-provider") {
    const provider = process.env.AI_PROVIDER ?? "mock";
    return res.json({
      success: true,
      message: `AI Provider actuel : ${provider}. Mode mock si aucune clé réelle n'est configurée.`,
      isMock: provider === "mock" || !process.env.AI_API_KEY,
      testedAt,
    });
  }

  if (name === "knowledge-source") {
    const connector = process.env.KNOWLEDGE_CONNECTOR ?? "mock";
    return res.json({
      success: true,
      message: `Knowledge Source actuelle : ${connector}. Mode mock si aucune source réelle n'est configurée.`,
      isMock: connector === "mock",
      testedAt,
    });
  }

  if (name === "notion") {
    const result = await fetchBlacklaceKnowledgeWithDiagnostics();
    const preview = result.items.slice(0, 8).map((item) => ({
      id: item.id,
      title: item.title,
      universe: item.universe,
      excerpt: item.content.length > 220 ? `${item.content.slice(0, 220)}…` : item.content,
      tags: item.tags,
    }));

    return res.json({
      success: !result.error,
      message: result.error
        ? `Notion configuré mais lecture impossible : ${result.error}`
        : `Connexion Notion réussie — ${result.items.length} entrées trouvées. Aperçu affiché ci-dessous.`,
      isMock: result.isMock,
      testedAt,
      preview,
    });
  }

  if (!isConfigured) {
    return res.json({
      success: true,
      message: `Mode mock actif pour ${def.displayName}. Variables requises : ${def.requiredVars.join(", ")}`,
      isMock: true,
      testedAt,
    });
  }

  return res.json({
    success: true,
    message: `Variables configurées pour ${def.displayName}. Connexion prête.`,
    isMock: false,
    testedAt,
  });
});

export default router;
