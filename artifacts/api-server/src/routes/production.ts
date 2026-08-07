import type { Request, Response } from "express";
import { Router } from "express";
import {
  executeComposioTool,
  isActiveComposioStatus,
  isComposioConfigured,
  listComposioConnectedAccounts,
  listComposioTools,
  type ComposioTool,
} from "../services/composio";
import { executeMistralText, isMistralTextConfigured } from "../services/mistral-text";
import { productionEngine, type ProducerCapability, type ProductionRequest } from "../publisher/production-engine";

const router = Router();
const COMPOSIO_USER_ID = process.env.COMPOSIO_USER_ID?.trim() || "benoit-lubert";

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Erreur inconnue";
  return message
    .replace(/sk-[a-zA-Z0-9_-]+/g, "[secret]")
    .replace(/ak_[a-zA-Z0-9_-]+/g, "[secret]")
    .replace(/Bearer\s+[a-zA-Z0-9._-]+/g, "Bearer [secret]");
}

function stringValue(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function recordValue(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
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

async function canvaAccount() {
  const accounts = await productionAccounts();
  return accountFor(accounts, "canva");
}

function toolText(tool: ComposioTool): string {
  return `${tool.slug} ${tool.name} ${tool.description}`.toLowerCase();
}

function scoreCanvaCreateTool(tool: ComposioTool): number {
  const text = toolText(tool);
  if (!text.includes("design")) return -100;
  if (/export|metadata|access|format|list|get|fetch|delete|update|comment|folder/.test(text)) return -50;
  return (/create/.test(text) ? 80 : 0) + (/post/.test(text) ? 45 : 0) + (/designs?/.test(text) ? 30 : 0) + (/instagram|social/.test(text) ? 20 : 0) + (/canva/.test(text) ? 10 : 0);
}

function selectCanvaCreateTools(tools: ComposioTool[]): ComposioTool[] {
  return tools.map((tool) => ({ tool, score: scoreCanvaCreateTool(tool) })).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score).map((entry) => entry.tool);
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
  const preferences = key.includes("type") ? ["instagram", "social", "post", "custom", "square"] : ["png", "public", "edit", "view"];
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
  if (/width|height/.test(normalized)) return 1080;
  if (/design.?type|format|preset|category/.test(normalized)) return type === "object" ? { type: "custom", width: 1080, height: 1080 } : "instagram_post";
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
    if (required.has(key) || /title|name|label|width|height|design.?type|format|preset|category|description|prompt|content|text/.test(normalized)) args[key] = schemaValue(key, definition, title);
  }
  return Object.keys(args).length ? args : { title: `Visuel principal ${title}`, design_type: "instagram_post" };
}

function walkPayload(value: unknown, visit: (key: string, item: unknown) => void, depth = 0): void {
  if (depth > 8 || value === null || value === undefined) return;
  if (Array.isArray(value)) return value.forEach((item) => walkPayload(item, visit, depth + 1));
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
    if (/url|link|href|thumbnail|download/i.test(key) && /^https?:\/\//i.test(item)) urls.push(item.trim());
    if (/(^|_)(design_?)?id$|designid/i.test(key) && !/^https?:\/\//i.test(item)) ids.push(item.trim());
  });
  const id = ids.find(Boolean) ?? null;
  const rankedUrls = [...new Set(urls)].sort((a, b) => ((/canva\.com\/design/i.test(b) ? 100 : 0) - (/canva\.com\/design/i.test(a) ? 100 : 0)));
  const url = rankedUrls[0] ?? (id ? `https://www.canva.com/design/${encodeURIComponent(id)}/edit` : null);
  if (!id && !url) return null;
  return { id: id ?? `canva_${Date.now()}`, kind: "social-visual", title: `Visuel principal · ${title}`, url, downloadUrl: rankedUrls.find((item) => /download|export|\.png(?:\?|$)|\.jpg(?:\?|$)/i.test(item)) ?? null, mimeType: "image/png", rawReference: { designId: id } };
}

function normalizeCapability(value: unknown): ProducerCapability {
  const text = String(value ?? "").toLowerCase().replace(/_/g, "-");
  if (["html", "html-local", "landing", "landing-page"].includes(text)) return "landing-page";
  if (["canva", "visual", "social-visual"].includes(text)) return "social-visual";
  if (["elevenlabs", "voice", "voice-over"].includes(text)) return "voice-over";
  if (["kling", "video"].includes(text)) return "video";
  if (["metricool", "publish"].includes(text)) return "publish";
  if (["gmail", "email"].includes(text)) return "email";
  return "landing-page";
}

function productionRequestFromBody(body: Record<string, unknown>): ProductionRequest {
  const input = recordValue(body.input);
  return { id: stringValue(body.requestId) ?? `production-${Date.now()}`, capability: normalizeCapability(body.capability ?? body.type ?? body.tool), title: stringValue(input.title ?? body.title) ?? "Production Publisher", objective: stringValue(input.objective ?? body.objective) ?? undefined, input, preferredProducerId: stringValue(body.preferredProducerId ?? body.tool) ?? undefined };
}

function isCopyExecution(tool: string, action: string, body: Record<string, unknown>): boolean {
  const capability = String(body.capability ?? body.type ?? "").toLowerCase();
  return tool === "mistral" || action === "generate_text" || action === "copy.generate" || capability === "copy.generate" || capability === "copy" || capability === "text-document";
}

router.get("/diagnostics", async (_req, res) => {
  try {
    const accounts = await productionAccounts();
    const canva = accountFor(accounts, "canva");
    const elevenLabs = accountFor(accounts, "elevenlabs");
    const [canvaTools, elevenLabsTools] = await Promise.all([canva ? listComposioTools("canva").catch(() => []) : Promise.resolve([]), elevenLabs ? listComposioTools("elevenlabs").catch(() => []) : Promise.resolve([])]);
    const canvaCreationTools = selectCanvaCreateTools(canvaTools);
    return res.json({
      composio: { configured: isComposioConfigured(), canvaConnected: Boolean(canva), elevenLabsConnected: Boolean(elevenLabs), connectedAccounts: accounts.filter((account) => isActiveComposioStatus(account.status)).map((account) => ({ id: account.id, toolkitSlug: account.toolkitSlug, status: account.status })) },
      canva: { status: canvaCreationTools.length ? "executable" : providerStatus(canva, isComposioConfigured()), connected: Boolean(canva), provider: "composio", discoveredToolCount: canvaTools.length },
      elevenLabs: { status: providerStatus(elevenLabs, isComposioConfigured()), connected: Boolean(elevenLabs), provider: "composio", discoveredToolCount: elevenLabsTools.length, executable: false },
      mistral: { status: isMistralTextConfigured() ? "executable" : "unavailable", configured: isMistralTextConfigured(), available: isMistralTextConfigured(), capability: "copy.generate" },
    });
  } catch (error) {
    return res.status(502).json({ status: "failed", mistral: { status: isMistralTextConfigured() ? "executable" : "unavailable", configured: isMistralTextConfigured() }, error: safeError(error) });
  }
});

router.post("/plan", (req, res) => {
  const body = recordValue(req.body);
  if (isCopyExecution(String(body.tool ?? "").toLowerCase(), String(body.action ?? "").toLowerCase(), body)) {
    return res.json({ request: body, plan: { id: `plan-copy-${Date.now()}`, status: isMistralTextConfigured() ? "ready" : "blocked", capability: "copy.generate", steps: [{ id: "mistral-copy", producerId: "mistral", status: isMistralTextConfigured() ? "ready" : "blocked" }] } });
  }
  const request = productionRequestFromBody(body);
  return res.json({ request, plan: productionEngine.plan(request) });
});

router.post("/execute", async (req, res) => {
  try {
    const body = recordValue(req.body);
    const tool = String(body.tool ?? "").toLowerCase();
    const action = String(body.action ?? "").toLowerCase();

    if (isCopyExecution(tool, action, body)) {
      if (!isMistralTextConfigured()) return res.status(409).json({ status: "waiting-authorization", code: "MISTRAL_NOT_CONFIGURED", error: "La clé Mistral doit être configurée dans Publisher." });
      const input = recordValue(body.input);
      const title = stringValue(input.title ?? body.title) ?? "Livrable textuel Publisher";
      const prompt = stringValue(input.prompt ?? body.prompt ?? input.objective ?? body.objective);
      if (!prompt) return res.status(400).json({ status: "failed", code: "PROMPT_REQUIRED", error: "Un prompt est requis pour copy.generate." });
      const artifact = await executeMistralText({ title, prompt, systemPrompt: stringValue(input.systemPrompt ?? body.systemPrompt) ?? undefined, maxTokens: Number(input.maxTokens ?? body.maxTokens ?? 5000), temperature: Number(input.temperature ?? body.temperature ?? 0.25) });
      return res.json({ status: "completed", provider: "mistral", tool: "mistral", action: "copy.generate", artifact });
    }

    const capability = normalizeCapability(body.capability ?? body.type ?? tool);
    if (capability === "landing-page" && (tool === "html-local" || tool === "html" || action.includes("landing"))) {
      const request = productionRequestFromBody({ ...body, capability: "landing-page", preferredProducerId: "html-local" });
      const plan = productionEngine.plan(request);
      const report = await productionEngine.execute(plan, request);
      return res.status(report.status === "completed" ? 200 : 422).json({ status: report.status, provider: "production-engine", tool: "html-local", action: "HTML_LOCAL_LANDING_PAGE", plan, artifact: report.artifacts[0] ?? null, errors: report.errors });
    }

    if (tool !== "canva" || action !== "create_design") return res.status(400).json({ status: "failed", code: "PRODUCER_NOT_IMPLEMENTED", error: `Le producteur ${tool || "inconnu"}/${action || "action inconnue"} n'a pas encore d'exécuteur validé.` });
    const account = await canvaAccount();
    if (!account) return res.status(409).json({ status: "waiting-authorization", code: "CANVA_NOT_CONNECTED", error: "Canva nécessite une connexion ou une autorisation." });
    const candidates = selectCanvaCreateTools(await listComposioTools("canva"));
    const title = stringValue(recordValue(body.input).title) ?? "Production Publisher";
    const attempts: Array<{ slug: string; arguments: Record<string, unknown>; error: string }> = [];
    for (const candidate of candidates) {
      const args = canvaArguments(candidate, title);
      try {
        const result = await executeComposioTool({ toolSlug: candidate.slug, connectedAccountId: account.id, arguments: args });
        const artifact = extractCanvaArtifact(result, title);
        if (artifact?.url) return res.json({ status: "completed", provider: "composio", tool: "canva", action: candidate.slug, artifact });
        attempts.push({ slug: candidate.slug, arguments: args, error: "Aucun lien exploitable retourné." });
      } catch (error) { attempts.push({ slug: candidate.slug, arguments: args, error: safeError(error) }); }
    }
    return res.status(502).json({ status: "failed", code: "CANVA_EXECUTION_FAILED", error: "Aucune action Canva n'a produit de visuel exploitable.", attempts });
  } catch (error) {
    return res.status(502).json({ status: "failed", code: "PRODUCTION_PROVIDER_ERROR", error: safeError(error) });
  }
});

export default router;
