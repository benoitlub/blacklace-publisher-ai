import { Router } from "express";
import { fetchBlacklaceKnowledgeWithDiagnostics } from "../services/notion";
import { resetAIProvider } from "../ai/providerRegistry";
import {
  clearConnectorSetting,
  CONNECTOR_SETTINGS_DEFINITIONS,
  getConnectorSecret,
  getPublicConnectorSetting,
  listPublicConnectorSettings,
  updateConnectorSetting
} from "../services/connector-settings";

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
    description: "Moteur IA interchangeable : mock, Mistral, OpenAI, Anthropic, Gemini, Ollama, OpenRouter ou API personnalisee.",
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
    description: "Fournisseur IA optionnel. Le systeme peut aussi fonctionner avec d'autres providers.",
    requiredVars: ["MISTRAL_API_KEY"],
  },
  {
    name: "github",
    displayName: "GitHub",
    description: "Lecture des depots, changelogs, builds et assets pour alimenter la memoire editoriale.",
    requiredVars: ["GITHUB_TOKEN", "GITHUB_REPO"],
  },
  {
    name: "meta",
    displayName: "Meta (Instagram / Facebook)",
    description: "Publication sur Instagram et Facebook via Meta Graph API. Non active en V1.",
    requiredVars: ["META_ACCESS_TOKEN", "META_PAGE_ID", "META_IG_USER_ID"],
  },
  {
    name: "instagram",
    displayName: "Instagram",
    description: "Publication Instagram via compte Business. Configuration serveur uniquement.",
    requiredVars: ["INSTAGRAM_TOKEN", "INSTAGRAM_BUSINESS_ID"],
  },
  {
    name: "linkedin",
    displayName: "LinkedIn",
    description: "Publication LinkedIn via organisation ou profil configure cote serveur.",
    requiredVars: ["LINKEDIN_TOKEN", "LINKEDIN_ORGANIZATION_ID"],
  },
  {
    name: "tiktok",
    displayName: "TikTok",
    description: "Publication de videos et contenus courts via TikTok Content Posting API. Non active en V1.",
    requiredVars: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "TIKTOK_ACCESS_TOKEN"],
  },
  {
    name: "youtube",
    displayName: "YouTube",
    description: "Publication video YouTube via credentials serveur. Non active en V1.",
    requiredVars: ["YOUTUBE_API_KEY", "YOUTUBE_CHANNEL_ID"],
  },
  {
    name: "kdp",
    displayName: "KDP (Amazon)",
    description: "Suivi editorial et reporting autour des publications Kindle Direct Publishing. Non active en V1.",
    requiredVars: ["KDP_ACCESS_KEY", "KDP_SECRET_KEY", "KDP_SELLER_ID"],
  },
];

function isNotionConfigured(): boolean {
  const apiKey = process.env.NOTION_API_KEY ?? getConnectorSecret("notion", "apiKey");
  const databaseId = process.env.NOTION_DATABASE_ID ?? getConnectorSecret("notion", "databaseId");
  const pageId = process.env.NOTION_PAGE_ID ?? getConnectorSecret("notion", "pageId");
  return !!apiKey && (!!databaseId || !!pageId);
}

function isMistralConfigured(): boolean {
  const configuredKey = process.env.AI_API_KEY ?? process.env.MISTRAL_API_KEY ?? getConnectorSecret("mistral", "apiKey");
  const providerName = (process.env.AI_PROVIDER ?? (configuredKey ? "mistral" : "mock")).toLowerCase();
  return providerName === "mistral" && !!configuredKey;
}

function hasServerSetting(name: string): boolean {
  const serverSetting = getPublicConnectorSetting(name);
  return (
    !!serverSetting &&
    (Object.values(serverSetting.values).some((value) => value.trim().length > 0) ||
      Object.values(serverSetting.secrets).some((secret) => secret.configured))
  );
}

function isConnectorConfigured(def: ConnectorDef): boolean {
  if (def.name === "notion") return isNotionConfigured();
  if (def.name === "mistral") return isMistralConfigured();
  if (def.name === "ai-provider") return (!!process.env.AI_PROVIDER && process.env.AI_PROVIDER !== "mock") || hasServerSetting(def.name);
  if (def.name === "knowledge-source") {
    return (!!process.env.KNOWLEDGE_CONNECTOR && process.env.KNOWLEDGE_CONNECTOR !== "mock") || hasServerSetting(def.name);
  }
  if (hasServerSetting(def.name)) return true;
  return def.requiredVars.every((v) => !!process.env[v]);
}

function getConnectorStatus(def: ConnectorDef): "connected" | "disconnected" | "mock" {
  if (def.name === "ai-provider" || def.name === "knowledge-source" || def.name === "notion" || def.name === "mistral") {
    return isConnectorConfigured(def) ? "connected" : "mock";
  }

  const allSet = def.requiredVars.every((v) => !!process.env[v]);
  if (allSet) return "connected";
  const someSet = def.requiredVars.some((v) => !!process.env[v]);
  if (someSet) return "disconnected";
  return "mock";
}

router.get("/", (_req, res) => {
  const settings = listPublicConnectorSettings();
  const connectors = CONNECTOR_DEFS.map((def) => ({
    name: def.name,
    displayName: def.displayName,
    description: def.description,
    status: getConnectorStatus(def),
    requiredVars: def.requiredVars,
    isConfigured: isConnectorConfigured(def),
    settings: settings.find((setting) => setting.id === def.name) ?? null,
    fields: CONNECTOR_SETTINGS_DEFINITIONS.find((setting) => setting.id === def.name)?.fields ?? [],
    lastTestedAt: null,
  }));
  return res.json(connectors);
});

router.get("/:name/settings", (req, res) => {
  const setting = getPublicConnectorSetting(req.params.name);
  if (!setting) return res.status(404).json({ error: "Connector settings not found" });
  return res.json(setting);
});

router.put("/:name/settings", (req, res) => {
  const setting = updateConnectorSetting(req.params.name, req.body as Record<string, unknown>);
  if (!setting) return res.status(404).json({ error: "Connector settings not found" });
  if (req.params.name === "mistral") {
    resetAIProvider();
  }
  return res.json(setting);
});

router.delete("/:name/settings", (req, res) => {
  clearConnectorSetting(req.params.name);
  if (req.params.name === "mistral") {
    resetAIProvider();
  }
  return res.status(204).send();
});

router.get("/knowledge-source/preview", async (_req, res) => {
  const diagnostics = await fetchBlacklaceKnowledgeWithDiagnostics();
  return res.json({
    connected: diagnostics.connected,
    source: diagnostics.source,
    title: diagnostics.title,
    charCount: diagnostics.charCount,
    sectionCount: diagnostics.sectionCount,
    error: diagnostics.error,
    items: diagnostics.items.slice(0, 10).map((item) => ({
      id: item.id,
      title: item.title,
      universe: item.universe,
      excerpt: item.content.slice(0, 200),
      isMock: item.isMock,
    })),
  });
});

router.post("/:name/test", async (req, res) => {
  const { name } = req.params;
  const def = CONNECTOR_DEFS.find((d) => d.name === name);
  if (!def) return res.status(404).json({ error: "Connector not found" });

  const testedAt = new Date().toISOString();

  if (name === "ai-provider") {
    const provider = process.env.AI_PROVIDER ?? "mock";
    return res.json({
      success: true,
      message: `AI Provider actuel : ${provider}. Mode mock si aucune cle reelle n'est configuree.`,
      isMock: provider === "mock" || !process.env.AI_API_KEY,
      testedAt,
    });
  }

  if (name === "knowledge-source") {
    const connector = process.env.KNOWLEDGE_CONNECTOR ?? "mock";
    return res.json({
      success: true,
      message: `Knowledge Source actuelle : ${connector}. Mode mock si aucune source reelle n'est configuree.`,
      isMock: connector === "mock",
      testedAt,
    });
  }

  if (name === "notion") {
    const diagnostics = await fetchBlacklaceKnowledgeWithDiagnostics();
    const preview = diagnostics.items.slice(0, 8).map((item) => ({
      id: item.id,
      title: item.title,
      universe: item.universe,
      excerpt: item.content.length > 220 ? `${item.content.slice(0, 220)}...` : item.content,
      tags: item.tags,
    }));

    return res.json({
      success: true,
      message: diagnostics.connected
        ? `Connexion Notion reussie - ${diagnostics.sectionCount} section(s), ${diagnostics.charCount} caracteres depuis "${diagnostics.title}".`
        : `Mode mock actif - ${diagnostics.sectionCount} entrees simulees retournees.${diagnostics.error ? ` Raison : ${diagnostics.error}` : ""}`,
      isMock: !diagnostics.connected,
      testedAt,
      source: diagnostics.source,
      title: diagnostics.title,
      charCount: diagnostics.charCount,
      sectionCount: diagnostics.sectionCount,
      error: diagnostics.error,
      preview,
    });
  }

  if (name === "mistral") {
    const configured = isMistralConfigured();
    return res.json({
      success: true,
      message: configured
        ? "Mistral configure (AI_PROVIDER=mistral) - generation reelle active."
        : "Mode mock actif pour Mistral AI. Configurez AI_PROVIDER=mistral et MISTRAL_API_KEY pour une generation reelle.",
      isMock: !configured,
      testedAt,
      source: configured ? "mistral" : "mock",
      title: null,
      charCount: null,
      sectionCount: null,
      error: configured ? null : "AI_PROVIDER n'est pas defini sur mistral, ou MISTRAL_API_KEY est absente.",
    });
  }

  const isConfigured = def.requiredVars.every((v) => !!process.env[v]);
  const hasStoredSetting = hasServerSetting(name);
  if (!isConfigured) {
    return res.json({
      success: true,
      message: hasStoredSetting
        ? `Configuration serveur enregistree pour ${def.displayName}. Test externe non active en V1.`
        : `Mode mock actif pour ${def.displayName}. Variables requises : ${def.requiredVars.join(", ")}`,
      isMock: !hasStoredSetting,
      testedAt,
    });
  }

  return res.json({
    success: true,
    message: `Variables configurees pour ${def.displayName}. Connexion prete.`,
    isMock: false,
    testedAt,
  });
});

export default router;
