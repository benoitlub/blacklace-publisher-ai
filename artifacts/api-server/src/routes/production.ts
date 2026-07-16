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

function recordValue(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function toolText(tool: ComposioTool): string {
  return `${tool.slug} ${tool.name} ${tool.description}`.toLowerCase();
}

function scoreCanvaCreateTool(tool: ComposioTool): number {
  const text = toolText(tool);
  if (!text.includes("design")) return -100;
  if (/export|metadata|access|format|list|get|fetch|delete|update|comment|folder/.test(text)) return -50;
  let score = 0;
  if (/create/.test(text)) score += 80;
  if (/post/.test(text)) score += 45;
  if (/designs?/.test(text)) score += 30;
  if (/instagram|social/.test(text)) score += 20;
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

function schemaProperties(tool: ComposioTool): Record<string, Record<string, any>> {
  const schema = recordValue(tool.inputSchema);
  const properties = recordValue(schema.properties ?? schema.schema?.properties);
  return Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, recordValue(value)]));
}

function schemaRequired(tool: ComposioTool): string[] {
  const schema = recordValue(tool.inputSchema);
  const required = schema.required ?? schema.schema?.required;
  return Array.isArray(required) ? required.filter((item): item is string => typeof item === "string") : [];
}

function preferredEnum(values: unknown[], key: string): unknown {
  const normalized = values.map((value) => ({ value, text: String(value).toLowerCase() }));
  const preferences = key.includes("type")
    ? ["instagram", "social", "post", "custom", "square"]
    : ["png", "public", "edit", "view"];
  for (const preference of preferences) {
    const found = normalized.find((entry) => entry.text.includes(preference));
    if (found) return found.value;
  }
  return values[0];
}

function schemaValue(key: string, definition: Record<string, any>, title: string): unknown {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  const enumValues = Array.isArray(definition.enum) ? definition.enum : [];
  if (enumValues.length) return preferredEnum(enumValues, normalized);

  const type = String(definition.type ?? "").toLowerCase();
  if (/title|name|label/.test(normalized)) return `Visuel principal ${title}`;
  if (/width/.test(normalized)) return 1080;
  if (/height/.test(normalized)) return 1080;
  if (/design.?type|format|preset|category/.test(normalized)) {
    if (type === "object") return { type: "custom", width: 1080, height: 1080 };
    return "instagram_post";
  }
  if (/description|prompt|content|text/.test(normalized)) return `Créer un visuel Instagram carré pour ${title}.`;
  if (type === "number" || type === "integer") return 1080;
  if (type === "boolean") return false;
  if (type === "array") return [];
  if (type === "object") return {};
  return title;
}

function canvaArguments(tool: ComposioTool, title: string): Record<string, unknown> {
  const properties = schemaProperties(tool);
  const required = new Set(schemaRequired(tool));
  const args: Record<string, unknown> = {};

  for (const [key, definition] of Object.entries(properties)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    const recognized = /title|name|label|width|height|design.?type|format|preset|category|description|prompt|content|text/.test(normalized);
    if (required.has(key) || recognized) args[key] = schemaValue(key, definition, title);
  }

  if (!Object.keys(args).length) {
    return {
      title: `Visuel principal ${title}`,
      design_type: "instagram_post",
    };
  }
  return args;
}

function walkPayload(value: unknown, visit: (key: string, item: unknown) => void, depth = 0): void {
  if (depth > 8 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((item) => walkPayload(item, visit, depth + 1));
    return;
  }
  if (typeof value !== "object") return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    visit(key, item);
    walkPayload(item, visit, depth + 1);
  }
}

function extractCanvaArtifact(payload: unknown, title: string) {
  const urls: string[] = [];
  const ids: string[] = [];
  walkPayload(payload, (key, item) => {
    if (typeof item !== "string" || !item.trim()) return;
    const normalizedKey = key.toLowerCase();
    if (/url|link|href|thumbnail|download/.test(normalizedKey) && /^https?:\/\//i.test(item)) urls.push(item.trim());
    if (/(^|_)(design_?)?id$|designid/i.test(normalizedKey) && !/^https?:\/\//i.test(item)) ids.push(item.trim());
  });

  const id = ids.find(Boolean) ?? null;
  const rankedUrls = [...new Set(urls)].sort((a, b) => {
    const score = (url: string) => (/canva\.com\/design/i.test(url) ? 100 : 0) + (/edit/i.test(url) ? 30 : 0) + (/view/i.test(url) ? 20 : 0) - (/thumbnail/i.test(url) ? 10 : 0);
    return score(b) - score(a);
  });
  const url = rankedUrls[0] ?? (id ? `https://www.canva.com/design/${encodeURIComponent(id)}/edit` : null);
  const downloadUrl = rankedUrls.find((item) => /download|export|\.png(?:\?|$)|\.jpg(?:\?|$)/i.test(item)) ?? null;
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
        connectedAccounts: accounts.filter((account) => isActiveComposioStatus(account.status)).map((account) => ({ id: account.id, toolkitSlug: account.toolkitSlug, status: account.status })),
      },
      canva: {
        status: canvaCreationTools.length ? "executable" : providerStatus(canva, isComposioConfigured()),
        connected: Boolean(canva),
        connectedAccount: canva?.id ?? null,
        provider: "composio",
        discoveredToolCount: canvaTools.length,
        creationActions: canvaCreationTools.map((tool) => ({
          slug: tool.slug,
          name: tool.name,
          description: tool.description,
          required: schemaRequired(tool),
          generatedArguments: canvaArguments(tool, "Diagnostic Publisher"),
        })),
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
      mistral: { status: mistralConfigured ? "available" : "unavailable", configured: mistralConfigured, available: mistralConfigured },
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
      return res.status(409).json({ status: "waiting-authorization", code: "CANVA_NOT_CONNECTED", error: "Canva nécessite une connexion ou une autorisation.", action: "Reconnecter Canva" });
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
    const attempts: Array<{ slug: string; arguments: Record<string, unknown>; error: string }> = [];

    for (const candidate of candidates) {
      const args = canvaArguments(candidate, title);
      try {
        const result = await executeComposioTool({ toolSlug: candidate.slug, connectedAccountId: account.id, arguments: args });
        const artifact = extractCanvaArtifact(result, title);
        if (!artifact?.url) {
          attempts.push({ slug: candidate.slug, arguments: args, error: "Aucun identifiant ou lien de design exploitable retourné." });
          continue;
        }
        return res.json({ status: "completed", provider: "composio", tool: "canva", action: candidate.slug, artifact });
      } catch (error) {
        attempts.push({ slug: candidate.slug, arguments: args, error: safeError(error) });
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
    return res.status(502).json({ status: "failed", code: "PRODUCTION_PROVIDER_ERROR", error: safeError(error) });
  }
});

export default router;
