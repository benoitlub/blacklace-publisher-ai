import { Router } from "express";
import { fetchBlacklaceKnowledge } from "../services/notion";

const router = Router();

interface ConnectorDef {
  name: string;
  displayName: string;
  description: string;
  requiredVars: string[];
}

const CONNECTOR_DEFS: ConnectorDef[] = [
  {
    name: "notion",
    displayName: "Notion",
    description: "Synchronise la Bible Blacklace et la base de connaissances éditoriale",
    requiredVars: ["NOTION_API_KEY", "NOTION_DATABASE_ID"],
  },
  {
    name: "mistral",
    displayName: "Mistral AI",
    description: "Génère des brouillons de posts via l'API Mistral",
    requiredVars: ["MISTRAL_API_KEY"],
  },
  {
    name: "github",
    displayName: "GitHub",
    description: "Publie automatiquement le code et les builds des projets",
    requiredVars: ["GITHUB_TOKEN", "GITHUB_REPO"],
  },
  {
    name: "meta",
    displayName: "Meta (Instagram / Facebook)",
    description: "Publication sur Instagram et Facebook via Meta Graph API",
    requiredVars: ["META_ACCESS_TOKEN", "META_PAGE_ID", "META_IG_USER_ID"],
  },
  {
    name: "tiktok",
    displayName: "TikTok",
    description: "Publication de vidéos et contenu sur TikTok via Content Posting API",
    requiredVars: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "TIKTOK_ACCESS_TOKEN"],
  },
  {
    name: "kdp",
    displayName: "KDP (Amazon)",
    description: "Suivi et reporting des publications Kindle Direct Publishing",
    requiredVars: ["KDP_ACCESS_KEY", "KDP_SECRET_KEY", "KDP_SELLER_ID"],
  },
];

function getConnectorStatus(def: ConnectorDef): "connected" | "disconnected" | "mock" {
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

  if (name === "notion") {
    try {
      const items = await fetchBlacklaceKnowledge();
      const isMock = items[0]?.isMock ?? true;
      return res.json({
        success: true,
        message: isMock
          ? `Mode mock actif — ${items.length} entrées simulées retournées. Configurez NOTION_API_KEY et NOTION_DATABASE_ID pour une vraie connexion.`
          : `Connexion Notion réussie — ${items.length} entrées trouvées.`,
        isMock,
        testedAt,
      });
    } catch {
      return res.json({ success: false, message: "Erreur lors du test Notion", isMock: true, testedAt });
    }
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
