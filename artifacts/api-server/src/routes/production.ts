import { Router } from "express";
import {
  executeComposioTool,
  isActiveComposioStatus,
  isComposioConfigured,
  listComposioConnectedAccounts,
} from "../services/composio";

const router = Router();
const COMPOSIO_USER_ID = process.env.COMPOSIO_USER_ID?.trim() || "benoit-lubert";

function isMistralConfigured(): boolean {
  return Boolean((process.env.AI_API_KEY ?? process.env.MISTRAL_API_KEY)?.trim());
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Erreur inconnue";
  return message.replace(/sk-[a-zA-Z0-9_-]+/g, "[secret]").replace(/Bearer\s+[a-zA-Z0-9._-]+/g, "Bearer [secret]");
}

async function canvaAccount() {
  if (!isComposioConfigured()) return null;
  const accounts = await listComposioConnectedAccounts(COMPOSIO_USER_ID);
  return accounts.find((account) => account.toolkitSlug === "canva" && isActiveComposioStatus(account.status)) ?? null;
}

function stringValue(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function extractCanvaArtifact(payload: unknown) {
  const record = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, any> : {};
  const data = record.data && typeof record.data === "object" ? record.data : record;
  const design = data.design && typeof data.design === "object" ? data.design : data;
  const urls = design.urls && typeof design.urls === "object" ? design.urls : {};
  const url = stringValue(urls.view_url ?? urls.viewUrl ?? urls.edit_url ?? urls.editUrl ?? design.url ?? data.url);
  const downloadUrl = stringValue(data.downloadUrl ?? data.download_url ?? urls.download_url);
  const id = stringValue(design.id ?? data.id ?? record.id);
  if (!id && !url) return null;
  return {
    id: id ?? `canva_${Date.now()}`,
    kind: "instagram-visual",
    title: "Visuel Instagram TERRA",
    url,
    downloadUrl,
    mimeType: downloadUrl ? "image/png" : null,
    rawProvider: "composio",
  };
}

router.get("/diagnostics", async (_req, res) => {
  try {
    const account = await canvaAccount();
    return res.json({
      composio: {
        configured: isComposioConfigured(),
        canvaConnected: Boolean(account),
      },
      mistral: {
        configured: isMistralConfigured(),
        available: isMistralConfigured(),
      },
    });
  } catch (error) {
    return res.status(502).json({
      composio: { configured: isComposioConfigured(), canvaConnected: false },
      mistral: { configured: isMistralConfigured(), available: isMistralConfigured() },
      error: safeError(error),
    });
  }
});

router.post("/execute", async (req, res) => {
  const tool = String(req.body?.tool ?? "").toLowerCase();
  const action = String(req.body?.action ?? "").toLowerCase();
  if (tool !== "canva" || action !== "create_design") {
    return res.status(400).json({ status: "failed", error: "Seule l'action canva/create_design est autorisée dans cette passe." });
  }

  let account = null;
  try {
    account = await canvaAccount();
  } catch (error) {
    return res.status(502).json({ status: "failed", error: safeError(error), action: "Ouvrir le Local technique" });
  }
  if (!account) {
    return res.status(409).json({ status: "waiting-authorization", error: "Canva nécessite une connexion ou une autorisation.", action: "Reconnecter Canva" });
  }

  const input = req.body?.input && typeof req.body.input === "object" ? req.body.input : {};
  const title = stringValue((input as Record<string, unknown>).title) ?? "TERRA";
  const result = await executeComposioTool({
    toolSlug: "CANVA_POST_DESIGNS",
    connectedAccountId: account.id,
    arguments: {
      title: `Visuel Instagram ${title}`,
      design_type: { type: "custom", width: 1080, height: 1080 },
    },
  }).catch((error) => ({ error: safeError(error) }));

  if (result && typeof result === "object" && "error" in result) {
    return res.status(502).json({ status: "failed", provider: "composio", tool: "canva", error: String((result as { error: unknown }).error), action: "Relancer uniquement l'étape Canva" });
  }

  const artifact = extractCanvaArtifact(result);
  if (!artifact?.url) {
    return res.status(502).json({ status: "failed", provider: "composio", tool: "canva", error: "Aucun artefact Canva exploitable retourné.", action: "Réessayer" });
  }

  return res.json({
    status: "completed",
    provider: "composio",
    tool: "canva",
    artifact,
  });
});

export default router;
