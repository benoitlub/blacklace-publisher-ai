import { Router } from "express";
import { fetchBlacklaceKnowledgeWithDiagnostics } from "../services/notion";
import { writeGlobalState } from "../services/global-state";
import {
  findComposioAuthConfig,
  initiateComposioConnection,
  isActiveComposioStatus,
  isComposioConfigured,
  listComposioConnectedAccounts,
} from "../services/composio";

const router = Router();

interface ConnectorDef {
  name: string;
  displayName: string;
  description: string;
  requiredVars: string[];
}

const COMPOSIO_USER_ID = process.env.COMPOSIO_USER_ID?.trim() || "benoit-lubert";
const COMPOSIO_TARGETS = [
  { id: "canva", label: "Canva", toolkitSlugs: ["canva"], capability: "visual" },
  { id: "elevenlabs", label: "ElevenLabs", toolkitSlugs: ["elevenlabs"], capability: "voice" },
  { id: "metricool", label: "Metricool", toolkitSlugs: ["metricool"], capability: "publish" },
  { id: "runway", label: "Runway", toolkitSlugs: ["runway", "runwayml"], capability: "video" },
  { id: "kling", label: "Kling", toolkitSlugs: ["kling", "klingai"], capability: "video" },
] as const;
const COMPOSIO_CONNECT_ERROR = "La connexion Canva n’a pas pu être ouverte. Le connecteur Composio doit être mis à jour.";

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
    description: "Fournisseur IA operationnel utilise comme pont de decision.",
    requiredVars: ["MISTRAL_API_KEY"],
  },
  {
    name: "composio",
    displayName: "Composio",
    description: "Pont OAuth et actions pour connecter les outils externes depuis le Garden.",
    requiredVars: ["COMPOSIO_API_KEY"],
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
    name: "tiktok",
    displayName: "TikTok",
    description: "Publication de videos et contenus courts via TikTok Content Posting API. Non active en V1.",
    requiredVars: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "TIKTOK_ACCESS_TOKEN"],
  },
  {
    name: "kdp",
    displayName: "KDP (Amazon)",
    description: "Suivi editorial et reporting autour des publications Kindle Direct Publishing. Non active en V1.",
    requiredVars: ["KDP_ACCESS_KEY", "KDP_SECRET_KEY", "KDP_SELLER_ID"],
  },
];

function isNotionConfigured(): boolean {
  return !!process.env.NOTION_API_KEY && (!!process.env.NOTION_DATABASE_ID || !!process.env.NOTION_PAGE_ID);
}

function isMistralConfigured(): boolean {
  const providerName = (process.env.AI_PROVIDER ?? "mistral").toLowerCase();
  return providerName === "mistral" && !!(process.env.AI_API_KEY ?? process.env.MISTRAL_API_KEY);
}

function isConnectorConfigured(def: ConnectorDef): boolean {
  if (def.name === "notion") return isNotionConfigured();
  if (def.name === "mistral") return isMistralConfigured();
  if (def.name === "composio") return isComposioConfigured();
  if (def.name === "ai-provider") return !!process.env.AI_PROVIDER && process.env.AI_PROVIDER !== "mock";
  if (def.name === "knowledge-source") {
    return !!process.env.KNOWLEDGE_CONNECTOR && process.env.KNOWLEDGE_CONNECTOR !== "mock";
  }
  return def.requiredVars.every((v) => !!process.env[v]);
}

function getConnectorStatus(def: ConnectorDef): "connected" | "disconnected" | "mock" {
  if (["ai-provider", "knowledge-source", "notion", "mistral", "composio"].includes(def.name)) {
    return isConnectorConfigured(def) ? "connected" : "mock";
  }
  const allSet = def.requiredVars.every((v) => !!process.env[v]);
  if (allSet) return "connected";
  const someSet = def.requiredVars.some((v) => !!process.env[v]);
  if (someSet) return "disconnected";
  return "mock";
}

function safeComposioLog(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown Composio error");
  return message
    .replace(/ak_[a-zA-Z0-9_-]+/g, "[secret]")
    .replace(/Bearer\s+[a-zA-Z0-9._-]+/g, "Bearer [secret]");
}

router.get("/", (_req, res) => {
  const connectors = CONNECTOR_DEFS.map((def) => ({
    name: def.name,
    displayName: def.displayName,
    description: def.description,
    status: getConnectorStatus(def),
    requiredVars: def.requiredVars,
    isConfigured: isConnectorConfigured(def),
    lastTestedAt: null,
  }));
  return res.json(connectors);
});

router.get("/composio/catalog", async (_req, res) => {
  if (!isComposioConfigured()) {
    return res.json({ configured: false, userId: COMPOSIO_USER_ID, providers: COMPOSIO_TARGETS.map((target) => ({ ...target, status: "not-configured", connectedAccountId: null })) });
  }
  try {
    const accounts = await listComposioConnectedAccounts(COMPOSIO_USER_ID);
    const providers = COMPOSIO_TARGETS.map((target) => {
      const account = accounts.find((item) => target.toolkitSlugs.includes(item.toolkitSlug as never));
      return {
        ...target,
        status: account && isActiveComposioStatus(account.status) ? "connected" : account ? "authorization-required" : "available",
        connectedAccountId: account?.id ?? null,
        remoteStatus: account?.status ?? null,
      };
    });
    return res.json({ configured: true, userId: COMPOSIO_USER_ID, providers });
  } catch (error) {
    console.warn("[composio] catalog unavailable", safeComposioLog(error));
    return res.status(502).json({ configured: true, userId: COMPOSIO_USER_ID, providers: [], error: "Diagnostic Composio indisponible." });
  }
});

router.post("/composio/connect", async (req, res) => {
  if (!isComposioConfigured()) return res.status(503).json({ error: "COMPOSIO_API_KEY is not configured" });
  const providerId = String(req.body?.provider ?? "").trim().toLowerCase();
  const callbackUrl = String(req.body?.callbackUrl ?? "").trim();
  const target = COMPOSIO_TARGETS.find((item) => item.id === providerId);
  if (!target || !callbackUrl) return res.status(400).json({ error: "provider and callbackUrl are required" });

  try {
    let authConfigId: string | null = null;
    let toolkitSlug: string = target.toolkitSlugs[0];
    for (const slug of target.toolkitSlugs) {
      authConfigId = await findComposioAuthConfig(slug);
      if (authConfigId) { toolkitSlug = slug; break; }
    }

    const request = await initiateComposioConnection({ userId: COMPOSIO_USER_ID, toolkitSlug, authConfigId, callbackUrl });
    await writeGlobalState("connections", target.id, {
      provider: target.label,
      status: "authorization-required",
      route: "composio",
      authorization: "required",
      creditStatus: "unknown",
      checkedAt: new Date().toISOString(),
      notes: `Composio ${request.status}; toolkit=${toolkitSlug}; account=${request.id ?? "pending"}`,
      connectedAccountId: request.id,
      toolkitSlug,
    });
    return res.json({ provider: target.id, status: request.status, connectedAccountId: request.id, redirectUrl: request.redirectUrl });
  } catch (error) {
    console.warn("[composio] unable to initiate connection", safeComposioLog(error));
    return res.status(502).json({ error: COMPOSIO_CONNECT_ERROR });
  }
});

router.post("/composio/refresh", async (_req, res) => {
  if (!isComposioConfigured()) return res.status(503).json({ error: "COMPOSIO_API_KEY is not configured" });
  try {
    const accounts = await listComposioConnectedAccounts(COMPOSIO_USER_ID);
    const providers = [];
    for (const target of COMPOSIO_TARGETS) {
      const account = accounts.find((item) => target.toolkitSlugs.includes(item.toolkitSlug as never));
      const connected = Boolean(account && isActiveComposioStatus(account.status));
      const record = {
        provider: target.label,
        status: connected ? "connected" : account ? "authorization-required" : "not-configured",
        route: "composio",
        authorization: connected ? "granted" : "required",
        creditStatus: "unknown",
        checkedAt: new Date().toISOString(),
        notes: account ? `Composio ${account.status}` : "No Composio connected account",
        connectedAccountId: account?.id ?? null,
        toolkitSlug: account?.toolkitSlug ?? target.toolkitSlugs[0],
      };
      await writeGlobalState("connections", target.id, record);
      providers.push({ id: target.id, label: target.label, ...record });
    }
    return res.json({ configured: true, userId: COMPOSIO_USER_ID, providers });
  } catch (error) {
    console.warn("[composio] refresh unavailable", safeComposioLog(error));
    return res.status(502).json({ error: "Diagnostic Composio indisponible." });
  }
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
    const provider = process.env.AI_PROVIDER ?? (process.env.MISTRAL_API_KEY ? "mistral" : "mock");
    return res.json({ success: true, message: `AI Provider actuel : ${provider}.`, isMock: provider === "mock", testedAt });
  }
  if (name === "knowledge-source") {
    const connector = process.env.KNOWLEDGE_CONNECTOR ?? "mock";
    return res.json({ success: true, message: `Knowledge Source actuelle : ${connector}.`, isMock: connector === "mock", testedAt });
  }
  if (name === "notion") {
    const diagnostics = await fetchBlacklaceKnowledgeWithDiagnostics();
    const preview = diagnostics.items.slice(0, 8).map((item) => ({ id: item.id, title: item.title, universe: item.universe, excerpt: item.content.length > 220 ? `${item.content.slice(0, 220)}...` : item.content, tags: item.tags }));
    return res.json({ success: true, message: diagnostics.connected ? `Connexion Notion reussie - ${diagnostics.sectionCount} section(s).` : `Mode mock actif.${diagnostics.error ? ` Raison : ${diagnostics.error}` : ""}`, isMock: !diagnostics.connected, testedAt, source: diagnostics.source, title: diagnostics.title, charCount: diagnostics.charCount, sectionCount: diagnostics.sectionCount, error: diagnostics.error, preview });
  }
  if (name === "mistral") {
    const configured = isMistralConfigured();
    return res.json({ success: configured, message: configured ? "Mistral est configure et deja operationnel." : "MISTRAL_API_KEY absente.", isMock: !configured, testedAt, source: configured ? "mistral" : "mock", error: configured ? null : "MISTRAL_API_KEY absente." });
  }
  if (name === "composio") {
    if (!isComposioConfigured()) return res.json({ success: false, message: "COMPOSIO_API_KEY absente dans Render.", isMock: true, testedAt, error: "COMPOSIO_API_KEY absente." });
    try {
      const accounts = await listComposioConnectedAccounts(COMPOSIO_USER_ID);
      return res.json({ success: true, message: `Composio repond. ${accounts.length} compte(s) connecte(s) detecte(s).`, isMock: false, testedAt, source: "composio", sectionCount: accounts.length });
    } catch (error) {
      return res.json({ success: false, message: "La cle Composio est presente mais l'API ne repond pas correctement.", isMock: false, testedAt, source: "composio", error: error instanceof Error ? error.message : "Composio unavailable" });
    }
  }

  const isConfigured = def.requiredVars.every((v) => !!process.env[v]);
  if (!isConfigured) return res.json({ success: true, message: `Mode mock actif pour ${def.displayName}. Variables requises : ${def.requiredVars.join(", ")}`, isMock: true, testedAt });
  return res.json({ success: true, message: `Variables configurees pour ${def.displayName}. Connexion prete.`, isMock: false, testedAt });
});

export default router;
