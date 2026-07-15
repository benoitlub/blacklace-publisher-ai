import { Router } from "express";
import {
  executeComposioTool,
  isActiveComposioStatus,
  isComposioConfigured,
  listComposioConnectedAccounts,
} from "../services/composio";
import { productionEngine, type ProducerCapability, type ProductionRequest } from "../publisher/production-engine";

const router = Router();
const COMPOSIO_USER_ID = process.env.COMPOSIO_USER_ID?.trim() || "benoit-lubert";
const CANVA_CREATE_DESIGN_ACTION = "CANVA_POST_DESIGNS";
const AVAILABLE_CANVA_ACTIONS = [
  {
    slug: "CANVA_POST_DESIGNS",
    description: "Creates a new Canva design with preset type or custom dimensions.",
    requiredFields: ["design_type"],
  },
  {
    slug: "CANVA_FETCH_DESIGN_METADATA_AND_ACCESS_INFORMATION",
    description: "Gets metadata and access URLs for a Canva design.",
    requiredFields: ["designId"],
  },
  {
    slug: "CANVA_GET_DESIGNS_DESIGNID_EXPORT_FORMATS",
    description: "Lists available export formats for a Canva design.",
    requiredFields: ["designId"],
  },
  {
    slug: "CANVA_POST_EXPORTS",
    description: "Starts an asynchronous export job for a Canva design.",
    requiredFields: ["design_id", "format"],
  },
  {
    slug: "CANVA_GET_DESIGN_EXPORT_JOB_RESULT",
    description: "Polls a Canva export job until download URLs are available.",
    requiredFields: ["exportId"],
  },
] as const;

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

async function productionAccounts() {
  if (!isComposioConfigured()) return [];
  return listComposioConnectedAccounts(COMPOSIO_USER_ID);
}

function accountFor(accounts: Awaited<ReturnType<typeof productionAccounts>>, toolkitSlug: string) {
  return accounts.find((account) => account.toolkitSlug === toolkitSlug && isActiveComposioStatus(account.status)) ?? null;
}

function providerStatus(account: unknown, configured = true) {
  if (!configured) return "unavailable";
  return account ? "connected" : "not-connected";
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
    rawReference: {
      designId: id,
    },
  };
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function productionRequestFromBody(body: Record<string, unknown>): ProductionRequest {
  const input = recordValue(body.input);
  const title = stringValue(input.title ?? body.title) ?? "Production Publisher";
  return {
    id: stringValue(body.requestId) ?? `production-${Date.now()}`,
    capability: normalizeCapability(body.capability ?? body.type ?? body.tool),
    title,
    objective: stringValue(input.objective ?? body.objective) ?? undefined,
    input,
    preferredProducerId: stringValue(body.preferredProducerId ?? body.tool) ?? undefined,
  };
}

function normalizeCapability(value: unknown): ProducerCapability {
  const text = String(value ?? "").toLowerCase().replace(/_/g, "-");
  if (text === "html" || text === "html-local" || text === "landing" || text === "landing-page") return "landing-page";
  if (text === "canva" || text === "visual" || text === "social-visual") return "social-visual";
  if (text === "elevenlabs" || text === "voice" || text === "voice-over") return "voice-over";
  if (text === "kling" || text === "video") return "video";
  if (text === "metricool" || text === "publish") return "publish";
  if (text === "gmail" || text === "email") return "email";
  return "landing-page";
}

function isLandingPageExecution(tool: string, action: string, body: Record<string, unknown>): boolean {
  const capability = normalizeCapability(body.capability ?? body.type ?? tool);
  return capability === "landing-page" && (tool === "html-local" || tool === "html" || action === "create_landing_page" || action === "create_landing-page");
}

router.get("/diagnostics", async (_req, res) => {
  try {
    const accounts = await productionAccounts();
    const canva = accountFor(accounts, "canva");
    const elevenLabs = accountFor(accounts, "elevenlabs");
    const mistralConfigured = isMistralConfigured();
    console.info(JSON.stringify({
      canvaConnectedAccount: canva?.id ?? null,
      elevenLabsConnectedAccount: elevenLabs?.id ?? null,
      availableActions: AVAILABLE_CANVA_ACTIONS,
    }));
    return res.json({
      composio: {
        configured: isComposioConfigured(),
        canvaConnected: Boolean(canva),
        elevenLabsConnected: Boolean(elevenLabs),
        connectedAccount: canva?.id ?? null,
        connectedAccounts: accounts
          .filter((account) => isActiveComposioStatus(account.status))
          .map((account) => ({ id: account.id, toolkitSlug: account.toolkitSlug, status: account.status })),
        availableActions: AVAILABLE_CANVA_ACTIONS,
      },
      canva: {
        status: providerStatus(canva, isComposioConfigured()),
        connected: Boolean(canva),
        connectedAccount: canva?.id ?? null,
        provider: "composio",
        availableActions: AVAILABLE_CANVA_ACTIONS,
      },
      elevenLabs: {
        status: providerStatus(elevenLabs, isComposioConfigured()),
        connected: Boolean(elevenLabs),
        connectedAccount: elevenLabs?.id ?? null,
        provider: "composio",
      },
      mistral: {
        status: mistralConfigured ? "available" : "unavailable",
        configured: mistralConfigured,
        available: mistralConfigured,
      },
    });
  } catch (error) {
    const mistralConfigured = isMistralConfigured();
    return res.status(502).json({
      composio: { configured: isComposioConfigured(), canvaConnected: false, elevenLabsConnected: false },
      canva: { status: "diagnostic-inaccessible", connected: false, provider: "composio" },
      elevenLabs: { status: "diagnostic-inaccessible", connected: false, provider: "composio" },
      mistral: { status: mistralConfigured ? "available" : "unavailable", configured: mistralConfigured, available: mistralConfigured },
      error: safeError(error),
    });
  }
});

router.post("/plan", (req, res) => {
  const body = recordValue(req.body);
  const request = productionRequestFromBody(body);
  const plan = productionEngine.plan(request);
  return res.json({ request, plan });
});

router.post("/execute", async (req, res) => {
  const tool = String(req.body?.tool ?? "").toLowerCase();
  const action = String(req.body?.action ?? "").toLowerCase();
  const body = recordValue(req.body);
  if (isLandingPageExecution(tool, action, body)) {
    const request = productionRequestFromBody({ ...body, capability: "landing-page", preferredProducerId: "html-local" });
    const plan = productionEngine.plan(request);
    const report = await productionEngine.execute(plan, request);
    return res.status(report.status === "completed" ? 200 : 422).json({
      status: report.status,
      provider: "production-engine",
      tool: "html-local",
      action: "HTML_LOCAL_LANDING_PAGE",
      plan,
      artifact: report.artifacts[0] ?? null,
      errors: report.errors,
    });
  }

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
  if (!AVAILABLE_CANVA_ACTIONS.some((action) => action.slug === CANVA_CREATE_DESIGN_ACTION)) {
    return res.status(501).json({
      status: "unsupported",
      reason: "La connexion Canva est active, mais aucune action de création de design n'est exposée pour ce compte via Composio.",
      connectedAccount: account.id,
      availableActions: AVAILABLE_CANVA_ACTIONS,
    });
  }

  const input = req.body?.input && typeof req.body.input === "object" ? req.body.input : {};
  const title = stringValue((input as Record<string, unknown>).title) ?? "TERRA";
  const result = await executeComposioTool({
    toolSlug: CANVA_CREATE_DESIGN_ACTION,
    connectedAccountId: account.id,
    arguments: {
      title: req.body?.operationId ? `Visuel Instagram ${title}` : "TERRA — test Poulpe Fiction",
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
    action: CANVA_CREATE_DESIGN_ACTION,
    artifact,
  });
});

export default router;
