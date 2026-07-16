import { Router } from "express";
import {
  executeComposioTool,
  isActiveComposioStatus,
  isComposioConfigured,
  listComposioConnectedAccounts,
  listComposioTools,
  type ComposioTool,
} from "../services/composio";
import { productionEngine, type ProducerCapability, type ProductionRequest } from "../publisher/production-engine";

const router = Router();
const COMPOSIO_USER_ID = process.env.COMPOSIO_USER_ID?.trim() || "benoit-lubert";

function isMistralConfigured(): boolean {
  return Boolean((process.env.AI_API_KEY ?? process.env.MISTRAL_API_KEY)?.trim());
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Erreur inconnue";
  return message
    .replace(/sk-[a-zA-Z0-9_-]+/g, "[secret]")
    .replace(/ak_[a-zA-Z0-9_-]+/g, "[secret]")
    .replace(/Bearer\s+[a-zA-Z0-9._-]+/g, "Bearer [secret]");
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

function toolText(tool: ComposioTool): string {
  return `${tool.slug} ${tool.name} ${tool.description}`.toLowerCase();
}

function scoreCanvaCreateTool(tool: ComposioTool): number {
  const text = toolText(tool);
  if (!text.includes("design")) return -100;
  if (/export|metadata|access|format|list|get|fetch|delete|update/.test(text)) return -50;
  let score = 0;
  if (/create/.test(text)) score += 60;
  if (/post/.test(text)) score += 35;
  if (/designs?/.test(text)) score += 25;
  if (/canva/.test(text)) score += 10;
  return score;
}

function selectCanvaCreateTools(tools: ComposioTool[]): ComposioTool[] {
  return tools
    .map((tool) => ({ tool, score: scoreCanvaCreateTool(tool) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.tool);
}

function extractCanvaArtifact(payload: unknown, title: string) {
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
    kind: "social-visual",
    title: `Visuel principal · ${title}`,
    url,
    downloadUrl,
    mimeType: downloadUrl ? "image/png" : null,
    rawReference: { designId: id },
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

function canvaArguments(title: string): Record<string, unknown> {
  return {
    title: `Visuel principal ${title}`,
    design_type: { type: "custom", width: 1080, height: 1080 },
    designType: { type: "custom", width: 1080, height: 1080 },
    width: 1080,
    height: 1080,
  };
}

router.get("/diagnostics", async (_req, res) => {
  try {
    const accounts = await productionAccounts();
    const canva = accountFor(accounts, "canva");
    const elevenLabs = accountFor(accounts, "elevenlabs");
    const mistralConfigured = isMistralConfigured();
    const [canvaTools, elevenLabsTools] = await Promise.all([
      canva ? listComposioTools("canva").catch(() => []) : Promise.resolve([]),
      elevenLabs ? listComposioTools("elevenlabs").catch(() => []) : Promise.resolve([]),
    ]);
    const canvaCreationTools = selectCanvaCreateTools(canvaTools);

    return res.json({
      composio: {
        configured: isComposioConfigured(),
        canvaConnected: Boolean(canva),
        elevenLabsConnected: Boolean(elevenLabs),
        connectedAccount: canva?.id ?? null,
        connectedAccounts: accounts
          .filter((account) => isActiveComposioStatus(account.status))
          .map((account) => ({ id: account.id, toolkitSlug: account.toolkitSlug, status: account.status })),
      },
      canva: {
        status: canvaCreationTools.length ? "executable" : providerStatus(canva, isComposioConfigured()),
        connected: Boolean(canva),
        connectedAccount: canva?.id ?? null,
        provider: "composio",
        discoveredToolCount: canvaTools.length,
        creationActions: canvaCreationTools.map((tool) => ({ slug: tool.slug, name: tool.name, description: tool.description })),
      },
      elevenLabs: {
        status: providerStatus(elevenLabs, isComposioConfigured()),
        connected: Boolean(elevenLabs),
        connectedAccount: elevenLabs?.id ?? null,
        provider: "composio",
        discoveredToolCount: elevenLabsTools.length,
        executable: false,
        reason: elevenLabs ? "Connexion trouvée, mais aucun exécuteur vocal validé dans Production Engine." : "Non connecté.",
      },
      kling: { status: "not-implemented", executable: false },
      metricool: { status: "not-implemented", executable: false },
      gmail: { status: "not-implemented", executable: false },
      mistral: {
        status: mistralConfigured ? "available" : "unavailable",
        configured: mistralConfigured,
        available: mistralConfigured,
      },
    });
  } catch (error) {
    const mistralConfigured = isMistralConfigured();
    return res.status(502).json({
      status: "failed",
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
  try {
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
      return res.status(400).json({
        status: "failed",
        code: "PRODUCER_NOT_IMPLEMENTED",
        error: `Le producteur ${tool || "inconnu"}/${action || "action inconnue"} n'a pas encore d'exécuteur validé.`,
      });
    }

    const account = await canvaAccount();
    if (!account) {
      return res.status(409).json({
        status: "waiting-authorization",
        code: "CANVA_NOT_CONNECTED",
        error: "Canva nécessite une connexion ou une autorisation.",
        action: "Reconnecter Canva",
      });
    }

    const tools = await listComposioTools("canva");
    const candidates = selectCanvaCreateTools(tools);
    if (!candidates.length) {
      return res.status(501).json({
        status: "unsupported",
        code: "CANVA_CREATE_TOOL_UNAVAILABLE",
        error: "Canva est connecté, mais Composio n'expose actuellement aucune action de création de design compatible.",
        connectedAccount: account.id,
        discoveredActions: tools.map((item) => item.slug),
      });
    }

    const input = recordValue(req.body?.input);
    const title = stringValue(input.title) ?? "Production Publisher";
    const attempts: Array<{ slug: string; error: string }> = [];

    for (const candidate of candidates) {
      try {
        const result = await executeComposioTool({
          toolSlug: candidate.slug,
          connectedAccountId: account.id,
          arguments: canvaArguments(title),
        });
        const artifact = extractCanvaArtifact(result, title);
        if (!artifact?.url) {
          attempts.push({ slug: candidate.slug, error: "Aucun lien de design exploitable retourné." });
          continue;
        }
        return res.json({
          status: "completed",
          provider: "composio",
          tool: "canva",
          action: candidate.slug,
          artifact,
        });
      } catch (error) {
        attempts.push({ slug: candidate.slug, error: safeError(error) });
      }
    }

    return res.status(502).json({
      status: "failed",
      code: "CANVA_EXECUTION_FAILED",
      provider: "composio",
      tool: "canva",
      error: "Canva est connecté, mais aucune action de création découverte n'a produit de visuel exploitable.",
      attempts,
      action: "Relancer uniquement l'étape Canva",
    });
  } catch (error) {
    return res.status(502).json({
      status: "failed",
      code: "PRODUCTION_PROVIDER_ERROR",
      error: safeError(error),
    });
  }
});

export default router;
