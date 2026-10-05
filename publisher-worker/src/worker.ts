import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  OBSERVATORY_DECISIONS,
  attachObservatoryOctopus,
  ensureObservatorySchema,
  ensureSchema,
  getSql,
  isDatabaseConfigured,
  databaseBindingDiagnostics,
  latestIteration,
  listGardenHarvests,
  getGardenHarvestById,
  listDueTentacles,
  listObservatorySources,
  markObservatorySourcesProcessed,
  recordIteration,
  setObservatoryDecision,
  upsertObservatorySource,
  upsertGardenHarvests,
  upsertTentacles,
  type ObservatoryDecision,
  type ObservatorySourceInput,
  type ObservatorySourceRow,
  type TentacleMode,
  type TentacleRow,
  type TentacleSeedInput,
} from "./db";
import { resolveKnowledgePackage } from "./knowledge/knowledge-package-resolver";
import type { NotionDiagnostics } from "./knowledge/notion";
import { knowledgeSourceDiagnostics } from "./knowledge/notion-preview";
import {
  ADAPTER_EXECUTION_CONTRACT,
  DEFAULT_OCTOPUS_URL,
  PUBLISHER_ADAPTER_CAPABILITIES,
  PUBLISHER_ADAPTER_ID,
  executeAdapterMission,
  registerWithOctopus,
  type OctopusAdapterEnvelope,
} from "./octopus-adapter";
import { observeWithOctopus, type PublisherObservationInput } from "./octopus-observation";

// Cloudflare has two different ways to give a Worker a secret value:
// - classic per-Worker "Variables and Secrets" -> env.KEY is a plain string.
// - the newer account-wide Secrets Store, bound via [[secrets_store_secrets]]
//   in wrangler.toml -> env.KEY is a binding object exposing an async
//   `.get()` that resolves to the string. Support both so this doesn't break
//   again depending on which one a secret was configured through.
export type SecretsStoreSecret = { get(): Promise<string> };
type ServiceBinding = { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> };
type Env = {
  MISTRAL_API_KEY?: string | SecretsStoreSecret;
  AI_API_KEY?: string | SecretsStoreSecret;
  MISTRAL_MODEL?: string;
  COMPOSIO_API_KEY?: string | SecretsStoreSecret;
  COMPOSIO_USER_ID?: string | SecretsStoreSecret;
  DATABASE_URL?: string | SecretsStoreSecret;
  GITHUB_TOKEN?: string | SecretsStoreSecret;
  NOTION_API_KEY?: string | SecretsStoreSecret;
  NOTION_DATABASE_ID?: string;
  NOTION_PAGE_ID?: string;
  /** Public origin of this Worker, announced to Octopus as the adapter base. */
  PUBLISHER_PUBLIC_URL?: string;
  OCTOPUS_ENGINE_URL?: string;
  OCTOPUS_ENGINE?: ServiceBinding;
};

async function resolveSecret(value: string | SecretsStoreSecret | undefined): Promise<string> {
  if (typeof value === "string") return value.trim();
  if (value && typeof (value as SecretsStoreSecret).get === "function") {
    try {
      const resolved = await (value as SecretsStoreSecret).get();
      return typeof resolved === "string" ? resolved.trim() : "";
    } catch (_) {
      return "";
    }
  }
  return "";
}

async function mistralApiKey(env: Env): Promise<string> {
  return (await resolveSecret(env.AI_API_KEY)) || (await resolveSecret(env.MISTRAL_API_KEY));
}

const app = new Hono<{ Bindings: Env }>();
app.use("*", cors());

app.get("/api/health", async (c) => {
  // Keep the adapter registration alive independently from the expensive
  // tentacle cron. Octopus stores adapters in memory, while Publisher's
  // autonomous production cron is intentionally disabled during quota control.
  // A normal health/readiness probe is therefore enough to heal a recycled
  // Octopus isolate without reactivating any Mistral/Canva production loop.
  const adapterRegistration = await registerWithOctopus({
    octopusUrl: octopusEngineUrl(c.env),
    publicBaseUrl: publisherPublicUrl(c.env),
    fetcher: c.env.OCTOPUS_ENGINE ? c.env.OCTOPUS_ENGINE.fetch.bind(c.env.OCTOPUS_ENGINE) as typeof fetch : undefined,
  });
  return c.json({
    status: "ok",
    service: "blacklace-publisher-worker",
    adapterRegistration,
  });
});

function safeContent(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value.map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part) return (part as any).text;
      return "";
    }).filter(Boolean).join("\n").trim();
  }
  return "";
}

async function executeMistralText(env: Env, request: { title: string; prompt: string; systemPrompt?: string; maxTokens?: number; temperature?: number }) {
  const key = await mistralApiKey(env);
  if (!key) throw new Error("Mistral n'est pas configuré dans Publisher.");
  if (!request.prompt.trim()) throw new Error("Le prompt Mistral est vide.");
  const model = (env.MISTRAL_MODEL || "mistral-small-latest").trim();

  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      model,
      temperature: Number.isFinite(request.temperature) ? request.temperature : 0.25,
      max_tokens: Number.isFinite(request.maxTokens) ? request.maxTokens : 5000,
      messages: [
        { role: "system", content: request.systemPrompt?.trim() || "Tu es le producteur textuel de Blacklace Publisher. Produis le livrable demandé, complet, factuel et directement exploitable. N'invente aucune donnée réelle manquante." },
        { role: "user", content: request.prompt },
      ],
    }),
  });

  const payload = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok) {
    const message = payload?.message ?? payload?.error?.message ?? `Mistral ${response.status}`;
    throw new Error(String(message));
  }
  const choice = Array.isArray(payload.choices) ? payload.choices[0] : null;
  const content = safeContent(choice?.message?.content);
  if (!content) throw new Error("Mistral n'a retourné aucun texte exploitable.");

  return {
    id: `mistral-text-${Date.now()}`,
    type: "text/markdown",
    title: request.title,
    content,
    mimeType: "text/markdown; charset=utf-8",
    createdAt: new Date().toISOString(),
    metadata: { provider: "mistral", model, finishReason: choice?.finish_reason ?? null, usage: payload.usage ?? null },
  };
}

// ============================================================================
// Composio (Canva) — real generative execution, ported from
// artifacts/api-server/src/services/composio.ts + routes/production.ts so
// the *permanently deployed* worker can actually produce visuals, not just
// Gérard's local text/HTML fallbacks. Only plain REST calls are used here
// (no @composio/core SDK, which needs a Node runtime) — this covers tool
// execution for an *already-connected* account. Connecting a new account
// (OAuth) still needs the full api-server run once; see docs/DEPLOYMENT.md.
// ============================================================================

const COMPOSIO_BASE_URL = "https://backend.composio.dev/api/v3";

interface ComposioConnectedAccount { id: string; toolkitSlug: string; status: string; }
interface ComposioTool { slug: string; name: string; description: string; toolkitSlug: string; inputSchema: Record<string, unknown> | null; }

async function isComposioConfigured(env: Env): Promise<boolean> {
  return Boolean(await resolveSecret(env.COMPOSIO_API_KEY));
}

async function composioUserId(env: Env): Promise<string> {
  return (await resolveSecret(env.COMPOSIO_USER_ID)) || "benoit-lubert";
}

/**
 * Une erreur HTTP de Composio, avec son statut conservé.
 *
 * Le message seul ne suffisait pas : les appelants ne pouvaient pas distinguer
 * « ce chemin n'est pas la bonne forme d'API » de « tu appelles trop vite ».
 */
export class ComposioHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ComposioHttpError";
    this.status = status;
  }
}

/** Composio demande de ralentir — l'indisponibilité est temporaire. */
export function isComposioRateLimit(error: unknown): boolean {
  return error instanceof ComposioHttpError && error.status === 429;
}

async function composioRequest(env: Env, path: string, init: RequestInit = {}): Promise<unknown> {
  const apiKey = await resolveSecret(env.COMPOSIO_API_KEY);
  if (!apiKey) throw new Error("COMPOSIO_API_KEY is not configured");
  const response = await fetch(`${COMPOSIO_BASE_URL}${path}`, {
    ...init,
    headers: { Accept: "application/json", "Content-Type": "application/json", "x-api-key": apiKey, ...(init.headers || {}) },
  });
  const text = await response.text();
  let payload: unknown = null;
  try { payload = text ? JSON.parse(text) : null; } catch (_) { payload = { message: text }; }
  if (!response.ok) {
    const record = asRecord(payload);
    // Composio v3 imbrique parfois le détail sous `error` — c'est la forme du
    // 429 observé le 20/08, dont le message se perdait sinon.
    const nested = asRecord(record.error);
    const message = typeof record.message === "string"
      ? record.message
      : typeof nested.message === "string"
        ? nested.message
        : text || `Composio ${response.status}`;
    throw new ComposioHttpError(response.status, `Composio ${response.status}: ${message}`);
  }
  return payload;
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function stringValue(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function normalize(value: string): string {
  return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function toolkitFrom(record: Record<string, unknown>): string {
  const toolkit = asRecord(record.toolkit);
  const authConfig = asRecord(record.auth_config ?? record.authConfig);
  const authToolkit = asRecord(authConfig.toolkit);
  return stringValue(
    record.toolkit_slug ?? record.toolkitSlug ?? record.app_name ?? record.appName ??
    toolkit.slug ?? toolkit.name ?? authConfig.toolkit_slug ?? authToolkit.slug ?? authToolkit.name,
  ) || "";
}

function extractItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  for (const key of ["items", "data", "results", "tools", "connected_accounts"]) {
    const value = record[key];
    if (Array.isArray(value)) return value;
    const nested = asRecord(value);
    if (Array.isArray(nested.items)) return nested.items;
    if (Array.isArray(nested.data)) return nested.data;
    if (Array.isArray(nested.tools)) return nested.tools;
  }
  return [];
}

async function listComposioConnectedAccounts(env: Env): Promise<ComposioConnectedAccount[]> {
  const userId = await composioUserId(env);
  const paths = [
    `/connected_accounts?user_ids=${encodeURIComponent(userId)}&limit=100`,
    `/connected_accounts?user_id=${encodeURIComponent(userId)}&limit=100`,
    "/connected_accounts?limit=100",
  ];
  const found = new Map<string, ComposioConnectedAccount>();
  let lastError: unknown = null;
  for (const path of paths) {
    try {
      const payload = await composioRequest(env, path);
      for (const item of extractItems(payload)) {
        const record = asRecord(item);
        const id = stringValue(record.id ?? record.connected_account_id);
        const toolkitSlug = toolkitFrom(record);
        if (id && toolkitSlug) found.set(id, { id, toolkitSlug: normalize(toolkitSlug), status: String(record.status ?? record.state ?? "UNKNOWN") });
      }
      if (found.size > 0) break;
    } catch (error) {
      lastError = error;
      // Ces trois chemins sont des variantes de forme d'API : les essayer l'un
      // après l'autre n'a de sens que si l'erreur dit « mauvaise forme ». Un 429
      // est une indisponibilité temporaire — il se reproduira à l'identique sur
      // la variante suivante, et chaque essai supplémentaire ne fait qu'ajouter
      // un appel à celui de trop.
      if (isComposioRateLimit(error)) break;
    }
  }
  if (found.size === 0 && lastError) throw lastError;
  return [...found.values()];
}

function isActiveComposioStatus(status: string): boolean {
  return ["ACTIVE", "CONNECTED", "SUCCESS", "ENABLED"].includes(String(status || "").toUpperCase());
}

function accountFor(accounts: ComposioConnectedAccount[], toolkitSlug: string): ComposioConnectedAccount | null {
  return accounts.find((account) => account.toolkitSlug === toolkitSlug && isActiveComposioStatus(account.status)) ?? null;
}

async function listComposioTools(env: Env, toolkitSlug: string): Promise<ComposioTool[]> {
  const normalizedToolkit = normalize(toolkitSlug);
  const queries = [
    `/tools?toolkit_slugs=${encodeURIComponent(toolkitSlug)}&limit=250`,
    `/tools?toolkit_slug=${encodeURIComponent(toolkitSlug)}&limit=250`,
  ];
  const found = new Map<string, ComposioTool>();
  let lastError: unknown = null;
  for (const path of queries) {
    try {
      const payload = await composioRequest(env, path);
      for (const item of extractItems(payload)) {
        const record = asRecord(item);
        const slug = stringValue(record.slug ?? record.name ?? record.tool_slug ?? record.toolSlug);
        if (!slug) continue;
        const toolkit = normalize(toolkitFrom(record) || normalizedToolkit);
        if (toolkit && toolkit !== normalizedToolkit) continue;
        // input_parameters is the real field name (confirmed live via
        // /tools?tool_slugs=...) — input_schema/inputSchema/parameters/schema
        // never matched anything, so inputSchema was always null here,
        // silently forcing canvaArguments() onto its hardcoded fallback
        // instead of the tool's actual declared properties.
        const schema = asRecord(record.input_parameters ?? record.input_schema ?? record.inputSchema ?? record.parameters ?? record.schema);
        found.set(slug, { slug, name: stringValue(record.name ?? record.display_name) || slug, description: stringValue(record.description) || "", toolkitSlug: toolkit || normalizedToolkit, inputSchema: Object.keys(schema).length ? schema : null });
      }
      if (found.size > 0) break;
    } catch (error) { lastError = error; }
  }
  if (found.size === 0 && lastError) throw lastError;
  return [...found.values()];
}

async function executeComposioTool(env: Env, input: { toolSlug: string; connectedAccountId: string; arguments: Record<string, unknown> }): Promise<unknown> {
  // Composio 400s ("ActionExecute_ConnectedAccountEntityIdRequired") without
  // entity_id alongside connected_account_id — confirmed live.
  return composioRequest(env, `/tools/execute/${encodeURIComponent(input.toolSlug)}`, {
    method: "POST",
    body: JSON.stringify({ arguments: input.arguments, connected_account_id: input.connectedAccountId, entity_id: await composioUserId(env) }),
  });
}

function toolText(tool: ComposioTool): string {
  return `${tool.slug} ${tool.name} ${tool.description}`.toLowerCase();
}

function selectMetricoolPublishTools(tools: ComposioTool[]): ComposioTool[] {
  const positive = /\b(create|publish|schedule|send|post)\b/;
  const negative = /\b(get|list|fetch|retrieve|delete|analytics|metric|report|status)\b/;
  return tools.filter((tool) => {
    const value = toolText(tool);
    return positive.test(value) && !negative.test(value);
  });
}


type SocialNetwork = "instagram" | "facebook" | "youtube";
const SOCIAL_NETWORKS = new Set<SocialNetwork>(["instagram", "facebook", "youtube"]);

/**
 * Safety-first contract between Gérard/Publisher and the eventual Metricool
 * executor. This function NEVER calls Composio/Metricool: it only validates
 * and normalizes a publication request. Keeping preparation separate from
 * execution lets us test the whole editorial hand-off without accidentally
 * publishing on Benoît's accounts.
 */
export function prepareSocialPublication(input: Record<string, unknown>) {
  const text = String(input.text ?? input.caption ?? "").trim();
  const requested = Array.isArray(input.networks) ? input.networks.map((item) => String(item).toLowerCase().trim()) : [];
  const networks = [...new Set(requested.filter((item): item is SocialNetwork => SOCIAL_NETWORKS.has(item as SocialNetwork)))];
  const media = Array.isArray(input.media) ? input.media.map(String).map((item) => item.trim()).filter(Boolean) : [];
  const publicationDate = String(input.publicationDate ?? "").trim() || null;
  const errors: string[] = [];

  if (!networks.length) errors.push("Au moins un réseau supporté est requis : instagram, facebook ou youtube.");
  if (!text && !networks.every((network) => network === "instagram" || network === "facebook")) errors.push("Un texte est requis pour cette combinaison de réseaux.");
  if (networks.includes("instagram") && media.length === 0) errors.push("Instagram exige au moins un média.");
  if (networks.includes("youtube") && media.length === 0) errors.push("YouTube exige une vidéo.");
  if (networks.includes("youtube") && !String(input.youtubeTitle ?? "").trim()) errors.push("YouTube exige un titre.");
  if (networks.includes("youtube") && typeof input.madeForKids !== "boolean") errors.push("YouTube exige madeForKids=true ou false.");

  return {
    contract: "publisher-social-publication-v1",
    status: errors.length ? "invalid" : "prepared",
    executable: false,
    autoPublish: false,
    brandId: "3350145",
    timezone: "Europe/Madrid",
    networks,
    text,
    media,
    publicationDate,
    youtube: networks.includes("youtube") ? {
      title: String(input.youtubeTitle ?? "").trim() || null,
      madeForKids: typeof input.madeForKids === "boolean" ? input.madeForKids : null,
      type: String(input.youtubeType ?? "video").toLowerCase() === "short" ? "short" : "video",
    } : null,
    provenance: {
      source: String(input.source ?? "gerard").trim() || "gerard",
      decision: String(input.decision ?? "").trim() || null,
      seedId: String(input.seedId ?? "").trim() || null,
    },
    errors,
  };
}

function scoreCanvaCreateTool(tool: ComposioTool): number {
  const text = toolText(tool);
  if (!text.includes("design")) return -100;
  if (/export|metadata|access|format|list|get|fetch|delete|update|comment|folder|retrieve|status|job/.test(text)) return -50;
  return (/create/.test(text) ? 80 : 0) + (/post/.test(text) ? 45 : 0) + (/designs?/.test(text) ? 30 : 0) + (/instagram|social/.test(text) ? 20 : 0) + (/canva/.test(text) ? 10 : 0);
}

function selectCanvaCreateTools(tools: ComposioTool[]): ComposioTool[] {
  return tools.map((tool) => ({ tool, score: scoreCanvaCreateTool(tool) })).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score).map((entry) => entry.tool);
}

function selectCanvaGenerativeTools(tools: ComposioTool[]): ComposioTool[] {
  return tools.filter((tool) => {
    const text = toolText(tool);
    return /\b(generate|autofill|image|text.?to.?image|magic|template|fill)\b/.test(text)
      && !/\b(get|list|fetch|retrieve|delete|status|metadata|comment)\b/.test(text);
  });
}

function scoreCanvaImageGenerator(tool: ComposioTool): number {
  const text = toolText(tool);
  if (/\b(get|list|fetch|retrieve|delete|status|metadata|comment|design)\b/.test(text)) return -100;
  return (/generate/.test(text) ? 100 : 0)
    + (/image|text.?to.?image/.test(text) ? 90 : 0)
    + (/asset|media/.test(text) ? 25 : 0)
    + (/magic/.test(text) ? 10 : 0);
}

function selectCanvaImageGenerators(tools: ComposioTool[]): ComposioTool[] {
  return tools
    .map((tool) => ({ tool, score: scoreCanvaImageGenerator(tool) }))
    .filter((entry) => entry.score > 100)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.tool);
}

function canvaImageArguments(tool: ComposioTool, prompt: string): Record<string, unknown> {
  const properties = schemaProperties(tool);
  const required = new Set(schemaRequired(tool));
  const args: Record<string, unknown> = {};
  for (const [key, definition] of Object.entries(properties)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (/prompt|description|text/.test(normalized)) args[key] = prompt;
    else if (/aspectratio/.test(normalized)) {
      const values = Array.isArray(definition.enum) ? definition.enum : [];
      args[key] = values.find((value) => /square|1.?1/i.test(String(value))) ?? values[0] ?? "SQUARE_1_1";
    } else if (required.has(key)) args[key] = schemaValue(key, definition, prompt);
  }
  if (!Object.keys(args).some((key) => /prompt|description|text/i.test(key))) args.prompt = prompt;
  return args;
}

function extractCanvaMedia(payload: unknown) {
  const envelope = asRecord(payload);
  if (envelope.successful === false) return null;
  let mediaId: string | null = null;
  let mediaUrl: string | null = null;
  walkPayload(payload, (key, item) => {
    if (typeof item !== "string" || !item.trim()) return;
    if (!mediaId && /^(media_?id|asset_?id|id)$/i.test(key) && !/^https?:\/\//i.test(item)) mediaId = item.trim();
    if (!mediaUrl && /^(url|download_?url|image_?url|thumbnail)$/i.test(key) && /^https?:\/\//i.test(item)) mediaUrl = item.trim();
  });
  return mediaId || mediaUrl ? { mediaId, url: mediaUrl } : null;
}

async function executeCanvaImage(env: Env, prompt: string, options: { onAttemptFailure?: (failure: { toolSlug: string; error: string }) => void } = {}) {
  if (!(await isComposioConfigured(env))) return null;
  const accounts = await listComposioConnectedAccounts(env);
  const account = accountFor(accounts, "canva");
  if (!account) return null;
  const generators = selectCanvaImageGenerators(await listComposioTools(env, "canva"));
  for (const candidate of generators.slice(0, 2)) {
    try {
      const result = await executeComposioTool(env, {
        toolSlug: candidate.slug,
        connectedAccountId: account.id,
        arguments: canvaImageArguments(candidate, prompt),
      });
      const media = extractCanvaMedia(result);
      if (media) return { toolSlug: candidate.slug, media, raw: result };
      const envelope = asRecord(result);
      options.onAttemptFailure?.({
        toolSlug: candidate.slug,
        error: stringValue(envelope.error) || "Canva a répondu sans asset/media exploitable.",
      });
    } catch (error) {
      options.onAttemptFailure?.({ toolSlug: candidate.slug, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return null;
}

function schemaProperties(tool: ComposioTool): Record<string, Record<string, any>> {
  const schema = asRecord(tool.inputSchema);
  const properties = asRecord(schema.properties ?? asRecord(schema.schema).properties);
  return Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, asRecord(value)]));
}

function schemaRequired(tool: ComposioTool): string[] {
  const schema = asRecord(tool.inputSchema);
  const required = schema.required ?? asRecord(schema.schema).required;
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
  // Fallback for when Composio doesn't expose an inputSchema for this tool
  // (confirmed live: null for CANVA_CREATE_CANVA_DESIGN_WITH_OPTIONAL_ASSET) —
  // Canva's own REST API rejected a bare string here ("One of 'design_type'
  // or 'asset_id' must be defined", confirmed live via the raw response),
  // because design_type is an object ({type, name}), not a string.
  if (!("design_type" in args) && !("asset_id" in args) && /create.*canva.*design/i.test(tool.slug)) {
    args.design_type = { type: "preset", name: "instagram_post" };
  }
  // Composio's Canva create tool currently exposes no usable schema, but the
  // upstream Canva endpoint still requires design_type. Match this exact
  // discovered slug as well instead of relying only on the loose slug regex.
  if (!("design_type" in args) && !("asset_id" in args) && tool.slug === "CANVA_CREATE_CANVA_DESIGN_WITH_OPTIONAL_ASSET") {
    args.design_type = { type: "preset", name: "instagram_post" };
  }
  if (!("title" in args) && /create.*canva.*design/i.test(tool.slug)) args.title = `Visuel principal ${title}`;
  return Object.keys(args).length ? args : { title: `Visuel principal ${title}`, design_type: { type: "preset", name: "instagram_post" } };
}

function walkPayload(value: unknown, visit: (key: string, item: unknown) => void, depth = 0): void {
  if (depth > 8 || value === null || value === undefined) return;
  if (Array.isArray(value)) { value.forEach((item) => walkPayload(item, visit, depth + 1)); return; }
  if (typeof value !== "object") return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    visit(key, item);
    walkPayload(item, visit, depth + 1);
  }
}

export function extractCanvaArtifact(payload: unknown, title: string) {
  // Composio wraps every tool call the same way regardless of the tool's
  // own outcome: { data, successful, error, log_id }. successful:false
  // still carries a log_id (its own execution-trace id, unrelated to
  // Canva) — confirmed live: a failed call ("One of 'design_type' or
  // 'asset_id' must be defined") was previously mistaken for success
  // because nothing checked this flag, and its log_id got turned into a
  // fake link like canva.com/design/log_XXXX/edit that 400s on Canva's
  // side. Bail out before even looking for a url/id.
  const envelope = asRecord(payload);
  if (envelope.successful === false) return null;

  const urls: string[] = [];
  const ids: string[] = [];
  walkPayload(payload, (key, item) => {
    if (typeof item !== "string" || !item.trim()) return;
    if (/url|link|href|thumbnail|download/i.test(key) && /^https?:\/\//i.test(item)) urls.push(item.trim());
    // Requires "design" in the key (not optional) — a bare "..._id" (like
    // Composio's own "log_id") used to match here too, confirmed live to
    // be the exact cause of broken Canva links.
    if (/(^|_)design_?id$|designid/i.test(key) && !/^https?:\/\//i.test(item)) ids.push(item.trim());
  });
  const id = ids.find(Boolean) ?? null;
  const rankedUrls = [...new Set(urls)].sort((a, b) => ((/canva\.com\/design/i.test(b) ? 100 : 0) - (/canva\.com\/design/i.test(a) ? 100 : 0)));
  const downloadUrl = rankedUrls.find((item) => /download|export|\.png(?:\?|$)|\.jpe?g(?:\?|$)|\.webp(?:\?|$)/i.test(item)) ?? null;
  // A Canva editor/design URL only proves that a design container exists. It
  // does NOT prove that the requested visual was rendered. We previously
  // labelled such empty designs as `social-visual`, which is a false positive.
  // Until Composio returns an exported/rendered image reference, keep the
  // attempt as a failure so Gérard never presents an empty Canva document as
  // a harvested visual.
  if (!downloadUrl) return null;
  const url = rankedUrls.find((item) => /canva\.com\/design/i.test(item)) ?? downloadUrl;
  return { id: id ?? `canva_${Date.now()}`, type: "social-visual", kind: "social-visual", title: `Visuel principal · ${title}`, url, downloadUrl, mimeType: "image/png", rawReference: { designId: id } };
}

// Shared by the on-demand /api/production/execute route AND the Neon-backed
// tentacle cycle (runImproveCycle/runPlayCycle) — one execution path for
// Canva, whether triggered by a browser tab or by the Cron schedule.
//
// Cloudflare caps subrequests per Worker invocation, and Composio reports
// 32 discovered Canva tools — trying every scored candidate on failure (or,
// worse, running a whole second discovery pass just to pick an "untried"
// slug, as an earlier version of this function's caller did) can blow that
// cap on its own. `excludeSlugs`/`requireNovel` let "play" mode ask for an
// untried tool from the SAME single discovery call instead of a separate
// one, and the attempt loop is capped regardless of mode.
const CANVA_MAX_ATTEMPTS = 4;

async function executeCanvaDesign(env: Env, title: string, options: { excludeSlugs?: string[]; requireNovel?: boolean; onAttemptFailure?: (failure: { toolSlug: string; error: string }) => void } = {}): Promise<{ toolSlug: string; artifact: NonNullable<ReturnType<typeof extractCanvaArtifact>> } | null> {
  if (!(await isComposioConfigured(env))) return null;
  const accounts = await listComposioConnectedAccounts(env);
  const account = accountFor(accounts, "canva");
  if (!account) return null;
  const scored = selectCanvaCreateTools(await listComposioTools(env, "canva"));
  const excluded = new Set(options.excludeSlugs || []);
  const pool = options.requireNovel ? scored.filter((candidate) => !excluded.has(candidate.slug)) : scored;
  if (options.requireNovel && !pool.length) return null;
  for (const candidate of pool.slice(0, CANVA_MAX_ATTEMPTS)) {
    const args = canvaArguments(candidate, title);
    try {
      const result = await executeComposioTool(env, { toolSlug: candidate.slug, connectedAccountId: account.id, arguments: args });
      const artifact = extractCanvaArtifact(result, title);
      if (artifact?.url) return { toolSlug: candidate.slug, artifact };
      const envelope = asRecord(result);
      const detail = stringValue(envelope.error) || (envelope.successful === false ? "Composio a renvoyé successful:false sans artefact Canva." : "Réponse reçue, mais aucun artefact Canva exploitable.");
      options.onAttemptFailure?.({ toolSlug: candidate.slug, error: detail });
    } catch (error) {
      options.onAttemptFailure?.({ toolSlug: candidate.slug, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return null;
}

// ============================================================================
// Octopus health — artifacts/blacklace-publisher's octopus-witness.tsx polls
// GET /api/octopus-adapter/health, expecting a persistent Octopus service
// to ping. There isn't one: octopus-engine's only real mechanism is
// poulpe-runtime.yml, a GitHub Actions workflow triggered per-Issue, not a
// server that answers a health check. Rather than fake a permanent
// "connected" state, this reports the *truth* about that ephemeral
// mechanism: the most recent real run's outcome, straight from GitHub's
// public API. "Octopus connecté" now means "the last run actually
// succeeded", not "a socket is open".
// ============================================================================

const OCTOPUS_REPO = "benoitlub/octopus-engine";
const OCTOPUS_WORKFLOW = "poulpe-runtime.yml";
// GitHub's unauthenticated REST API allows 60 req/hour/IP, and this widget
// polls every 15s (240/hour) — cache the lookup so repeated polls within
// this window reuse one real GitHub call instead of exhausting that budget.
const OCTOPUS_HEALTH_CACHE_MS = 120_000;
let octopusHealthCache: { body: Record<string, unknown>; fetchedAt: number } | null = null;

async function githubJson(env: Env, path: string): Promise<any> {
  // Unauthenticated GitHub REST calls are capped at 60/hour *per source IP*
  // — and Cloudflare Workers egress from a shared pool of IPs used by many
  // customers at once, so that budget is gone almost immediately in
  // practice (confirmed live: GitHub 403 on the very first real check). A
  // token raises this to 5000/hour, scoped to the token itself rather than
  // whichever IP happened to serve the request. No scopes are needed for
  // read-only access to a public repo's Actions data.
  const token = await resolveSecret(env.GITHUB_TOKEN);
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "blacklace-publisher-worker" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) throw new Error(`GitHub ${response.status}`);
  return response.json();
}

function mapOctopusRunStatus(run: Record<string, any>): "received" | "running" | "ready" | "failed" | "idle" {
  if (run.status === "completed") return run.conclusion === "success" ? "ready" : "failed";
  if (run.status === "in_progress") return "running";
  if (run.status === "queued" || run.status === "waiting" || run.status === "requested" || run.status === "pending") return "received";
  return "idle";
}

async function buildOctopusHealth(env: Env): Promise<Record<string, unknown>> {
  const startedAt = Date.now();
  try {
    const payload = await githubJson(env, `/repos/${OCTOPUS_REPO}/actions/workflows/${OCTOPUS_WORKFLOW}/runs?per_page=1`);
    const run = Array.isArray(payload?.workflow_runs) ? payload.workflow_runs[0] : null;
    const latencyMs = Date.now() - startedAt;
    if (!run) return { status: "ok", engine: { connected: false, latencyMs }, trace: null };

    const status = mapOctopusRunStatus(run);
    let artifactCount = 0;
    if (run.status === "completed") {
      try {
        const artifacts = await githubJson(env, `/repos/${OCTOPUS_REPO}/actions/runs/${run.id}/artifacts`);
        artifactCount = Array.isArray(artifacts?.artifacts) ? artifacts.artifacts.length : 0;
      } catch (_) { /* not critical to the health signal */ }
    }
    const receivedAt: string | null = run.created_at || null;
    const completedAt: string | null = run.status === "completed" ? (run.updated_at || null) : null;
    const runLatencyMs = receivedAt && completedAt ? Math.max(0, Date.parse(completedAt) - Date.parse(receivedAt)) : null;

    return {
      status: "ok",
      engine: { connected: status === "ready", latencyMs },
      trace: {
        missionId: String(run.id),
        operationId: String(run.run_number ?? run.id),
        capability: run.event || "workflow_dispatch",
        contextId: run.head_branch || null,
        status,
        producer: "octopus-engine",
        artifactCount,
        receivedAt,
        completedAt,
        latencyMs: runLatencyMs,
        error: status === "failed" ? "Le dernier passage a échoué — voir les logs GitHub Actions du run." : null,
      },
    };
  } catch (error) {
    return { status: "ok", engine: { connected: false, latencyMs: Date.now() - startedAt }, trace: null, debugNote: error instanceof Error ? error.message : String(error) };
  }
}

app.get("/api/octopus-adapter/health", async (c) => {
  if (octopusHealthCache && Date.now() - octopusHealthCache.fetchedAt < OCTOPUS_HEALTH_CACHE_MS) {
    return c.json(octopusHealthCache.body);
  }
  const body = await buildOctopusHealth(c.env);
  octopusHealthCache = { body, fetchedAt: Date.now() };
  return c.json(body);
});

app.get("/api/production/diagnostics", async (c) => {
  const env = c.env;
  try {
    const mistralConfigured = Boolean(await mistralApiKey(env));
    if (!(await isComposioConfigured(env))) {
      return c.json({ composio: { configured: false, canvaConnected: false, elevenLabsConnected: false, metricoolConnected: false, connectedAccounts: [] }, canva: { status: "unavailable", connected: false }, metricool: { status: "unavailable", connected: false, executable: false, discoveredToolCount: 0, publishCandidates: [] }, mistral: { status: mistralConfigured ? "executable" : "unavailable", configured: mistralConfigured, available: mistralConfigured } });
    }
    const accounts = await listComposioConnectedAccounts(env);
    const canva = accountFor(accounts, "canva");
    const elevenLabs = accountFor(accounts, "elevenlabs");
    const metricool = accountFor(accounts, "metricool");
    const linkedin = accountFor(accounts, "linkedin");
    const instagram = accountFor(accounts, "instagram");
    const whatsapp = accountFor(accounts, "whatsapp");
    const metricoolTools = metricool ? await listComposioTools(env, "metricool").catch(() => []) : [];
    const metricoolPublishTools = selectMetricoolPublishTools(metricoolTools);
    const socialToolkits = [
      { slug: "linkedin", account: linkedin },
      { slug: "instagram", account: instagram },
      { slug: "whatsapp", account: whatsapp },
    ];
    const socialChannels = await Promise.all(socialToolkits.map(async ({ slug, account }) => {
      const tools = account ? await listComposioTools(env, slug).catch(() => []) : [];
      const publish = tools.filter((tool) => /\b(create|publish|post|share|send)\b/.test(toolText(tool)) && !/\b(get|list|fetch|retrieve|delete|analytics|metric|report|status)\b/.test(toolText(tool)));
      const conversation = tools.filter((tool) => /\b(message|conversation|comment|reply|dm|inbox)\b/.test(toolText(tool)) && !/\b(delete|analytics|metric|report)\b/.test(toolText(tool)));
      const compact = (items: ComposioTool[]) => items.slice(0, 12).map((tool) => ({ slug: tool.slug, required: schemaRequired(tool), propertyNames: Object.keys(schemaProperties(tool)) }));
      return { slug, connected: Boolean(account), discoveredToolCount: tools.length, publishCandidates: compact(publish), conversationCandidates: compact(conversation), executable: false };
    }));
    const canvaTools = canva ? await listComposioTools(env, "canva").catch(() => []) : [];
    const canvaCreationTools = selectCanvaCreateTools(canvaTools);
    const canvaGenerativeTools = selectCanvaGenerativeTools(canvaTools);
    return c.json({
      composio: { configured: true, canvaConnected: Boolean(canva), elevenLabsConnected: Boolean(elevenLabs), metricoolConnected: Boolean(metricool), connectedAccounts: accounts.filter((a) => isActiveComposioStatus(a.status)).map((a) => ({ id: a.id, toolkitSlug: a.toolkitSlug, status: a.status })) },
      canva: { status: canvaGenerativeTools.length ? "generative-candidates-found" : canvaCreationTools.length ? "design-container-tools-only" : canva ? "connected" : "not-connected", connected: Boolean(canva), provider: "composio", executable: false, discoveredToolCount: canvaTools.length, generativeCandidates: canvaGenerativeTools.slice(0, 12).map((tool) => ({ slug: tool.slug, required: schemaRequired(tool), propertyNames: Object.keys(schemaProperties(tool)) })) },
      elevenLabs: { status: elevenLabs ? "connected" : "not-connected", connected: Boolean(elevenLabs), provider: "composio", executable: false },
      metricool: { status: metricoolPublishTools.length ? "candidate-tools-found" : metricool ? "connected-no-publish-tool" : "not-connected", connected: Boolean(metricool), provider: "composio", executable: false, discoveredToolCount: metricoolTools.length, publishCandidates: metricoolPublishTools.slice(0, 12).map((tool) => ({ slug: tool.slug, required: schemaRequired(tool), propertyNames: Object.keys(schemaProperties(tool)) })) },
      socialChannels,
      // configured/available are aliases of the same boolean, for the
      // artifacts/blacklace-publisher dashboard (local-technique.tsx),
      // which reads those field names instead of `status`.
      mistral: { status: mistralConfigured ? "executable" : "unavailable", configured: mistralConfigured, available: mistralConfigured },
    });
  } catch (error) {
    return c.json({ status: "failed", error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

function isCopyExecution(tool: string, action: string, body: Record<string, unknown>): boolean {
  const capability = String(body.capability ?? body.type ?? "").toLowerCase();
  return tool === "mistral" || action === "generate_text" || action === "copy.generate" || capability === "copy.generate" || capability === "copy" || capability === "text-document";
}

app.get("/api/production/canva-tools", async (c) => {
  try {
    if (!(await isComposioConfigured(c.env))) return c.json({ status: "unavailable", error: "Composio not configured." }, 503);
    const tools = await listComposioTools(c.env, "canva");
    return c.json({
      status: "ok",
      count: tools.length,
      tools: tools.map((tool) => ({
        slug: tool.slug,
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema ?? null,
      })),
    });
  } catch (error) {
    return c.json({ status: "failed", error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

app.get("/api/production/canva-tool-schema", async (c) => {
  try {
    if (!(await isComposioConfigured(c.env))) return c.json({ status: "unavailable", error: "Composio not configured." }, 503);
    const tools = await listComposioTools(c.env, "canva");
    const target = tools.find((tool) => tool.slug === "CANVA_CREATE_CANVA_DESIGN_WITH_OPTIONAL_ASSET");
    if (!target) return c.json({ status: "not-found", discovered: tools.map((tool) => tool.slug) }, 404);
    return c.json({
      status: "found",
      slug: target.slug,
      raw: target,
      normalized: {
        required: schemaRequired(target),
        properties: schemaProperties(target),
      },
    });
  } catch (error) {
    return c.json({ status: "failed", error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

app.post("/api/social/publication/prepare", async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}));
  const prepared = prepareSocialPublication(body);
  return c.json(prepared, prepared.status === "prepared" ? 200 : 422);
});

function metricoolPayloadFromPrepared(prepared: ReturnType<typeof prepareSocialPublication>) {
  const providers = prepared.networks.map((network) => ({ network }));
  const publicationDate = prepared.publicationDate;
  const info: Record<string, unknown> = {
    autoPublish: false,
    draft: true,
    descendants: [],
    firstCommentText: "",
    hasNotReadNotes: false,
    media: prepared.media,
    mediaAltText: [],
    providers,
    publicationDate: publicationDate ? { dateTime: publicationDate, timezone: prepared.timezone } : null,
    shortener: false,
    smartLinkData: { ids: [] },
    text: prepared.text,
  };
  if (prepared.networks.includes("facebook")) info.facebookData = { type: "POST" };
  if (prepared.networks.includes("instagram")) info.instagramData = { type: "POST", isAiGenerated: true };
  if (prepared.networks.includes("youtube") && prepared.youtube) {
    info.youtubeData = {
      title: prepared.youtube.title,
      type: prepared.youtube.type,
      privacy: "private",
      madeForKids: prepared.youtube.madeForKids,
      isAiGeneratedContent: true,
    };
  }
  return { blogId: prepared.brandId, date: publicationDate, info };
}

// Manual browser-friendly test trigger. Intentionally delegates to the exact same
// media production handler as POST /api/social/media/request; it does not publish
// or touch Metricool. Useful from a phone where issuing a POST is awkward.
app.get("/api/social/media/test", async (c) => {
  const harvestId = String(c.req.query("harvestId") || "").trim();
  if (!harvestId) return c.json({ status: "rejected", error: "harvestId is required" }, 400);
  const url = new URL(c.req.url);
  url.pathname = "/api/social/media/request";
  url.search = "";
  const request = new Request(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ harvestId }),
  });
  return app.fetch(request, c.env);
});

app.post("/api/social/media/request", async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}));
  const harvestId = String(body.harvestId ?? "").trim();
  if (!harvestId) return c.json({ status: "invalid", error: "harvestId est requis." }, 422);
  if (!(await isDatabaseConfigured(c.env))) return c.json({ configured: false, status: "invalid", error: "Database unavailable." }, 503);

  try {
    const sql = await getSql(c.env);
    const harvest = await getGardenHarvestById(sql, harvestId);
    if (!harvest) return c.json({ status: "invalid", error: "Récolte introuvable." }, 404);

    const editorial = classifyHarvestForSocial(harvest);
    const copy = extractSocialCopy(harvest.content);
    if (!editorial.eligible || !copy.text) return c.json({ status: "rejected", harvestId, editorial }, 422);

    if (editorial.media.direct && editorial.media.url) {
      return c.json({
        status: "publishable", contract: "gerard-social-media-v1", harvestId, seedId: harvest.seed_id,
        media: { url: editorial.media.url, direct: true },
        verification: { generated: false, publishable: true, reason: "existing-direct-media" },
      });
    }

    const failures: Array<{ toolSlug: string; error: string }> = [];
    const imagePrompt = `Create a polished square social-media promotional image for: ${harvest.title}. Context: ${copy.text}. Strong central composition, premium adult visual style, no readable text or logos unless explicitly required by the source content.`;
    const generatedImage = await executeCanvaImage(c.env, imagePrompt, {
      onAttemptFailure: (failure) => failures.push(failure),
    }).catch((error) => {
      failures.push({ toolSlug: "canva-image", error: error instanceof Error ? error.message : String(error) });
      return null;
    });

    if (generatedImage?.media?.url) {
      return c.json({
        status: "publishable",
        contract: "gerard-social-media-v1",
        harvestId,
        seedId: harvest.seed_id,
        title: harvest.title,
        copy,
        production: {
          provider: "canva-via-composio",
          mode: "generate-image",
          toolSlug: generatedImage.toolSlug,
          generated: true,
          mediaId: generatedImage.media.mediaId,
          outputUrl: generatedImage.media.url,
        },
        media: { url: generatedImage.media.url, id: generatedImage.media.mediaId, direct: true },
        verification: { generated: true, publishable: true, reason: "real-generated-canva-image" },
      });
    }

    if (generatedImage?.media?.mediaId) {
      return c.json({
        status: "generated-needs-public-url",
        contract: "gerard-social-media-v1",
        harvestId,
        seedId: harvest.seed_id,
        title: harvest.title,
        copy,
        production: {
          provider: "canva-via-composio",
          mode: "generate-image",
          toolSlug: generatedImage.toolSlug,
          generated: true,
          mediaId: generatedImage.media.mediaId,
          outputUrl: null,
        },
        verification: { generated: true, publishable: false, reason: "real-canva-media-id-awaiting-public-url" },
        nextAction: "resolve-canva-media-to-public-url",
      }, 202);
    }

    // Compatibility fallback: older Canva integrations may expose only design
    // creation/export tools. Keep that path, but never mistake an editor link
    // for generated media.
    const generated = await executeCanvaDesign(c.env, `${harvest.title} · ${copy.text}`, {
      onAttemptFailure: (failure) => failures.push(failure),
    }).catch((error) => {
      failures.push({ toolSlug: "canva-design-fallback", error: error instanceof Error ? error.message : String(error) });
      return null;
    });

    if (generated?.artifact?.downloadUrl) {
      return c.json({
        status: "publishable",
        contract: "gerard-social-media-v1",
        harvestId,
        seedId: harvest.seed_id,
        title: harvest.title,
        copy,
        production: {
          provider: "canva-via-composio",
          toolSlug: generated.toolSlug,
          generated: true,
          outputUrl: generated.artifact.downloadUrl,
          editUrl: generated.artifact.url,
        },
        media: { url: generated.artifact.downloadUrl, direct: true },
        verification: {
          generated: true,
          publishable: true,
          reason: "real-retrievable-canva-output",
        },
      });
    }

    return c.json({
      status: "failed",
      contract: "gerard-social-media-v1",
      harvestId,
      seedId: harvest.seed_id,
      title: harvest.title,
      copy,
      production: { provider: "canva-via-composio", generated: false, outputUrl: null, failures },
      verification: {
        generated: false,
        publishable: false,
        required: ["real-image-output", "retrievable-url", "supported-image-format", "no-editor-link-as-media"],
      },
      nextAction: "repair-or-enable-image-producer",
    }, 502);
  } catch (error) {
    return c.json({ status: "failed", error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

app.get("/api/social/publication/candidate-plans", async (c) => {
  if (!(await isDatabaseConfigured(c.env))) return c.json({ configured: false, status: "invalid", error: "Database unavailable." }, 503);
  try {
    const sql = await getSql(c.env);
    const rows = await listGardenHarvests(sql, { limit: 200, reusableOnly: true });
    const requestedLimit = Number(c.req.query("limit") ?? 10);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(25, Math.trunc(requestedLimit))) : 10;
    const candidates = rows
      .map((row) => ({ row, editorial: classifyHarvestForSocial(row), copy: extractSocialCopy(row.content) }))
      .filter(({ editorial, copy }) => editorial.eligible && copy.text.length > 0)
      .sort((a, b) => b.editorial.score - a.editorial.score || String(b.row.created_at ?? "").localeCompare(String(a.row.created_at ?? "")))
      .slice(0, limit)
      .map(({ row, editorial, copy }) => ({
        harvestId: row.id,
        seedId: row.seed_id,
        title: row.title,
        score: editorial.score,
        copy,
        editorial,
        media: {
          status: editorial.media.direct ? "publishable" : editorial.media.canvaEditLink ? "needs-export" : "missing",
          url: editorial.media.url,
          direct: editorial.media.direct,
          canvaEditLink: editorial.media.canvaEditLink,
        },
        recommendedNetworks: editorial.media.direct ? ["facebook", "instagram"] : ["facebook"],
        provenance: {
          source: "garden-autoselection",
          decision: "highest-ranked-reusable-harvest",
          seedId: row.seed_id,
          harvestId: row.id,
        },
      }));
    return c.json({
      status: "ready",
      contract: "garden-social-candidate-plans-v1",
      selectionPolicy: "highest-editorial-score-then-newest",
      execution: "read-only",
      candidates,
      guardrails: {
        maxPostsPerDay: 2,
        minimumSpacingHours: 4,
        duplicateProtection: "compare-copy-before-scheduling",
        killSwitch: "draft-only",
      },
    });
  } catch (error) {
    return c.json({ status: "failed", error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

app.get("/api/social/publication/next-plan", async (c) => {
  if (!(await isDatabaseConfigured(c.env))) return c.json({ configured: false, status: "invalid", error: "Database unavailable." }, 503);
  try {
    const sql = await getSql(c.env);
    const rows = await listGardenHarvests(sql, { limit: 200, reusableOnly: true });
    const ranked = rows
      .map((row) => ({ row, editorial: classifyHarvestForSocial(row) }))
      .filter(({ editorial }) => editorial.eligible)
      .sort((a, b) => b.editorial.score - a.editorial.score || String(b.row.created_at ?? "").localeCompare(String(a.row.created_at ?? "")));
    const selected = ranked[0];
    if (!selected) return c.json({ status: "empty", contract: "garden-next-social-plan-v1", message: "Aucune récolte sociale éligible." }, 404);

    const requestedDate = c.req.query("publicationDate")?.trim();
    const fallbackDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const publicationDate = requestedDate || fallbackDate;
    if (!Number.isFinite(Date.parse(publicationDate)) || Date.parse(publicationDate) <= Date.now()) {
      return c.json({ status: "invalid", error: "publicationDate future ISO requise." }, 422);
    }

    const prepared = prepareSocialPublication({
      networks: ["facebook"],
      text: extractSocialCopy(selected.row.content).text,
      media: [],
      publicationDate,
      source: "garden-autoselection",
      decision: "highest-ranked-reusable-harvest",
      seedId: selected.row.seed_id,
    });
    if (prepared.status !== "prepared") return c.json({ ...prepared, harvestId: selected.row.id, editorial: selected.editorial }, 422);

    return c.json({
      status: "planned",
      contract: "garden-next-social-plan-v1",
      selectionPolicy: "highest-editorial-score-then-newest",
      execution: "dry-run",
      executable: false,
      autoPublish: false,
      draft: true,
      copy: extractSocialCopy(selected.row.content),
      selected: {
        harvestId: selected.row.id,
        seedId: selected.row.seed_id,
        title: selected.row.title,
        score: selected.editorial.score,
        editorial: selected.editorial,
      },
      metricool: metricoolPayloadFromPrepared(prepared),
      provenance: { ...prepared.provenance, harvestId: selected.row.id },
      guardrails: {
        maxPostsPerDay: 2,
        minimumSpacingHours: 4,
        duplicateProtection: "required-before-live-execution",
        killSwitch: "live-execution-disabled",
      },
    });
  } catch (error) {
    return c.json({ status: "failed", error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

app.post("/api/social/publication/from-harvest/plan", async (c) => {
  if (!(await isDatabaseConfigured(c.env))) return c.json({ configured: false, status: "invalid", error: "Database unavailable." }, 503);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}));
  const harvestId = String(body.harvestId ?? "").trim();
  if (!harvestId) return c.json({ status: "invalid", error: "harvestId est requis." }, 422);

  try {
    const sql = await getSql(c.env);
    const harvest = await getGardenHarvestById(sql, harvestId);
    if (!harvest) return c.json({ status: "invalid", error: "Récolte introuvable." }, 404);

    const editorial = classifyHarvestForSocial(harvest);
    if (!editorial.eligible) {
      return c.json({ status: "rejected", harvestId, seedId: harvest.seed_id, editorial }, 422);
    }

    const networks = Array.isArray(body.networks) ? body.networks : ["facebook"];
    const prepared = prepareSocialPublication({
      networks,
      text: String(body.text ?? harvest.content ?? "").trim(),
      media: editorial.media.direct && editorial.media.url ? [editorial.media.url] : [],
      publicationDate: body.publicationDate,
      source: "garden-harvest",
      decision: String(body.decision ?? "reuse-existing-harvest").trim(),
      seedId: harvest.seed_id,
    });
    if (prepared.status !== "prepared") return c.json({ ...prepared, harvestId, editorial }, 422);
    if (!prepared.publicationDate || !Number.isFinite(Date.parse(prepared.publicationDate)) || Date.parse(prepared.publicationDate) <= Date.now()) {
      return c.json({ ...prepared, status: "invalid", harvestId, editorial, errors: [...prepared.errors, "publicationDate future ISO requise."] }, 422);
    }

    return c.json({
      status: "planned",
      contract: prepared.contract,
      execution: "dry-run",
      executable: false,
      autoPublish: false,
      draft: true,
      harvest: { harvestId: harvest.id, seedId: harvest.seed_id, title: harvest.title },
      editorial,
      metricool: metricoolPayloadFromPrepared(prepared),
      provenance: { ...prepared.provenance, harvestId: harvest.id },
      guardrails: {
        maxPostsPerDay: 2,
        minimumSpacingHours: 4,
        duplicateProtection: "required-before-live-execution",
        killSwitch: "live-execution-disabled",
      },
    });
  } catch (error) {
    return c.json({ status: "failed", error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

app.post("/api/social/publication/plan", async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}));
  const prepared = prepareSocialPublication(body);
  if (prepared.status !== "prepared") return c.json(prepared, 422);
  if (!prepared.publicationDate) {
    return c.json({ ...prepared, status: "invalid", errors: ["publicationDate est requis pour planifier."] }, 422);
  }
  const parsedDate = Date.parse(prepared.publicationDate);
  if (!Number.isFinite(parsedDate)) {
    return c.json({ ...prepared, status: "invalid", errors: ["publicationDate doit être une date ISO valide."] }, 422);
  }
  if (parsedDate <= Date.now()) {
    return c.json({ ...prepared, status: "invalid", errors: ["publicationDate doit être dans le futur."] }, 422);
  }

  const metricool = metricoolPayloadFromPrepared(prepared);
  return c.json({
    status: "planned",
    contract: prepared.contract,
    execution: "dry-run",
    executable: false,
    autoPublish: false,
    draft: true,
    metricool,
    provenance: prepared.provenance,
    guardrails: {
      maxPostsPerDay: 2,
      minimumSpacingHours: 4,
      duplicateProtection: "required-before-live-execution",
      killSwitch: "live-execution-disabled",
    },
  });
});

// No live /publish endpoint yet. /plan deliberately returns the exact
// Metricool-shaped payload without executing it. This is the boundary that
// lets Gérard plan autonomously while public publication remains disabled.

app.post("/api/production/execute", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, any>;
  const tool = String(body.tool ?? "").toLowerCase();
  const action = String(body.action ?? "").toLowerCase();

  try {
    if (isCopyExecution(tool, action, body)) {
      const input = body.input ?? {};
      const title = (input.title ?? body.title ?? "Livrable textuel Publisher") as string;
      const prompt = (input.prompt ?? body.prompt ?? input.objective ?? body.objective ?? "") as string;
      if (!prompt.trim()) return c.json({ status: "failed", code: "PROMPT_REQUIRED", error: "Un prompt est requis pour copy.generate." }, 400);

      const slugCandidates = [
        body.context?.parcelId, body.context?.seedId, body.parcelId, body.universe, input.universe,
      ].filter(Boolean);
      const notionApiKey = await resolveSecret(c.env.NOTION_API_KEY);
      const knowledge = await resolveKnowledgePackage(
        { NOTION_API_KEY: notionApiKey, NOTION_DATABASE_ID: c.env.NOTION_DATABASE_ID, NOTION_PAGE_ID: c.env.NOTION_PAGE_ID },
        slugCandidates,
      );

      if (!knowledge.verified) {
        return c.json({
          status: "failed",
          code: "KNOWLEDGE_PACKAGE_NOT_VERIFIED",
          error: `Publisher ne trouve pas de Knowledge Package vérifié pour « ${knowledge.slug} ». Aucune rédaction n'est lancée.`,
          diagnostics: knowledge.diagnostics,
        }, 422);
      }

      const artifact = await executeMistralText(c.env, {
        title,
        prompt,
        systemPrompt: [knowledge.prompt, input.systemPrompt ?? body.systemPrompt].filter(Boolean).join("\n\n"),
        maxTokens: Number(input.maxTokens ?? body.maxTokens ?? 5000),
        temperature: Number(input.temperature ?? body.temperature ?? 0.25),
      });
      return c.json({ status: "completed", provider: "mistral", tool: "mistral", action: "copy.generate", artifact, knowledgePackage: { slug: knowledge.slug, source: knowledge.source, verified: knowledge.verified } });
    }

    const capability = String(body.capability ?? body.type ?? tool).toLowerCase();
    if (["html", "html-local", "landing", "landing-page"].includes(capability) || tool === "html-local" || action.includes("landing")) {
      const artifact = generateLandingPage({ title: body.title, input: body.input });
      return c.json({ status: "completed", provider: "production-engine", tool: "html-local", action: "HTML_LOCAL_LANDING_PAGE", artifact });
    }

    if (["canva", "visual", "social-visual"].includes(capability) || tool === "canva") {
      if (!(await isComposioConfigured(c.env))) return c.json({ status: "waiting-authorization", code: "COMPOSIO_NOT_CONFIGURED", error: "Composio n'est pas configuré dans Publisher." }, 409);
      const accounts = await listComposioConnectedAccounts(c.env);
      if (!accountFor(accounts, "canva")) return c.json({ status: "waiting-authorization", code: "CANVA_NOT_CONNECTED", error: "Canva nécessite une connexion ou une autorisation." }, 409);
      const title = (body.input?.title as string) || (body.title as string) || "Production Publisher";
      const result = await executeCanvaDesign(c.env, title);
      if (!result) return c.json({ status: "failed", code: "CANVA_EXECUTION_FAILED", error: "Aucune action Canva n'a produit de visuel exploitable." }, 502);
      return c.json({ status: "completed", provider: "composio", tool: "canva", action: result.toolSlug, artifact: result.artifact });
    }

    return c.json({ status: "failed", code: "PRODUCER_NOT_IMPLEMENTED", error: `Le producteur ${tool || "inconnu"}/${action || "action inconnue"} n'a pas encore d'exécuteur validé sur ce Worker (ElevenLabs pas encore porté).` }, 400);
  } catch (error) {
    return c.json({ status: "failed", code: "PRODUCTION_PROVIDER_ERROR", error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" } as Record<string, string>)[char] ?? char);
}
function textInput(input: Record<string, unknown> | undefined, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = input?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}
function listInput(input: Record<string, unknown> | undefined, keys: string[], fallback: string[]): string[] {
  for (const key of keys) {
    const value = input?.[key];
    if (Array.isArray(value)) {
      const items = value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
      if (items.length) return items.slice(0, 6);
    }
  }
  return fallback;
}
function safeUrl(value: string): string {
  if (!value) return "#contact";
  if (/^(https?:|mailto:|tel:|#)/i.test(value)) return value;
  return "#contact";
}

function generateLandingPage(request: { title?: string; input?: Record<string, unknown> }) {
  const input = request.input ?? {};
  const headline = textInput(input, ["headline", "title", "projectName"], request.title?.trim() || "Une proposition à découvrir");
  const eyebrow = textInput(input, ["eyebrow", "category", "universe"], "Une création indépendante");
  const objective = textInput(input, ["objective", "promise", "description"], "Découvrez une proposition singulière, pensée pour offrir une expérience claire et mémorable.");
  const audience = textInput(input, ["audience", "targetAudience"], "Pour les curieux, les lecteurs et les partenaires à la recherche d'une expérience originale.");
  const offer = textInput(input, ["offer", "product", "service"], "Une création prête à être découverte, partagée ou proposée à votre public.");
  const price = textInput(input, ["price", "offerPrice"], "");
  const callToAction = textInput(input, ["callToAction", "cta", "buttonLabel"], price ? `Découvrir — ${price}` : "Découvrir le projet");
  const secondaryCta = textInput(input, ["secondaryCallToAction", "secondaryCta"], "En savoir plus");
  const actionUrl = safeUrl(textInput(input, ["url", "actionUrl", "purchaseUrl", "projectUrl"], "#contact"));
  const contactUrl = safeUrl(textInput(input, ["contactUrl", "email", "contact"], "#contact"));
  const benefits = listInput(input, ["benefits", "features", "highlights"], [
    "Une proposition compréhensible en quelques secondes",
    "Un univers identifiable et une promesse concrète",
    "Une prochaine action simple, sans parcours labyrinthique",
  ]);
  const steps = listInput(input, ["steps", "nextSteps"], [
    "Découvrez la proposition et vérifiez qu'elle vous correspond.",
    "Consultez les détails utiles avant de vous décider.",
    "Passez à l'action ou prenez contact simplement.",
  ]);
  const proof = textInput(input, ["proof", "credibility", "authorNote"], "Projet indépendant présenté sans chiffres, témoignages ni promesses inventées.");
  const footer = textInput(input, ["footer", "brand"], "Produit avec Blacklace Publisher");

  const benefitCards = benefits.map((benefit, index) => `
          <article class="card">
            <span class="number">0${index + 1}</span>
            <p>${escapeHtml(benefit)}</p>
          </article>`).join("");
  const stepCards = steps.map((step, index) => `
          <li><span>${index + 1}</span><p>${escapeHtml(step)}</p></li>`).join("");

  const content = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(objective.slice(0, 155))}">
  <title>${escapeHtml(headline)}</title>
  <style>
    :root{color-scheme:dark;--bg:#0d0d12;--panel:#171720;--line:#30303c;--text:#f7f4ee;--muted:#b8b3bd;--accent:#ff6542;--accent2:#9e70ff;--max:1120px}
    *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:radial-gradient(circle at 80% 0,#291b3e 0,transparent 33%),radial-gradient(circle at 0 30%,#302018 0,transparent 28%),var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.6}
    a{color:inherit}.wrap{width:min(calc(100% - 32px),var(--max));margin:auto}.topbar{display:flex;justify-content:space-between;align-items:center;padding:22px 0;font-size:.78rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--accent);margin-right:9px;box-shadow:0 0 18px var(--accent)}
    .hero{min-height:76vh;display:grid;align-items:center;padding:72px 0 96px}.hero-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(280px,.65fr);gap:48px;align-items:end}.eyebrow{color:var(--accent);font-weight:800;text-transform:uppercase;letter-spacing:.18em;font-size:.78rem}.hero h1{font-family:Georgia,"Times New Roman",serif;font-size:clamp(3rem,8vw,7.4rem);line-height:.92;letter-spacing:-.055em;margin:18px 0 28px;max-width:920px}.lead{font-size:clamp(1.1rem,2vw,1.45rem);color:var(--muted);max-width:720px}.actions{display:flex;gap:14px;flex-wrap:wrap;margin-top:34px}.button{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:0 24px;border-radius:999px;text-decoration:none;font-weight:800;border:1px solid var(--accent);background:var(--accent);color:#160b08}.button.secondary{background:transparent;color:var(--text);border-color:var(--line)}.offer{padding:26px;border:1px solid var(--line);border-radius:24px;background:linear-gradient(145deg,rgba(255,255,255,.07),rgba(255,255,255,.02));box-shadow:0 30px 80px rgba(0,0,0,.28)}.offer small{color:var(--muted);text-transform:uppercase;letter-spacing:.16em}.offer strong{display:block;font-family:Georgia,serif;font-size:1.8rem;line-height:1.15;margin:14px 0}.price{color:var(--accent);font-size:1.1rem;font-weight:800}
    section{padding:84px 0;border-top:1px solid var(--line)}.section-head{display:grid;grid-template-columns:.65fr 1.35fr;gap:32px;margin-bottom:38px}.section-head h2{font-family:Georgia,serif;font-size:clamp(2.2rem,5vw,4.2rem);line-height:1;margin:0}.section-head p{color:var(--muted);font-size:1.1rem;margin:0}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.card{min-height:190px;padding:24px;border-radius:22px;border:1px solid var(--line);background:var(--panel)}.number{color:var(--accent2);font-family:monospace;font-size:.82rem}.card p{font-size:1.1rem;margin:38px 0 0}.steps{list-style:none;padding:0;margin:0;display:grid;gap:14px}.steps li{display:grid;grid-template-columns:52px 1fr;gap:20px;align-items:center;padding:18px 20px;border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.025)}.steps span{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:var(--accent2);color:#120d19;font-weight:900}.steps p{margin:0}.proof{margin-top:28px;color:var(--muted);font-size:.9rem}.final{padding:96px 0;text-align:center}.final h2{font-family:Georgia,serif;font-size:clamp(2.4rem,6vw,5rem);line-height:1;margin:0 auto 22px;max-width:850px}.final p{color:var(--muted);max-width:680px;margin:0 auto 28px}footer{padding:32px 0 44px;border-top:1px solid var(--line);color:var(--muted);font-size:.85rem}
    @media(max-width:780px){.hero{padding:46px 0 72px}.hero-grid,.section-head{grid-template-columns:1fr}.hero-grid{gap:34px}.cards{grid-template-columns:1fr}.topbar{align-items:flex-start;gap:12px}.button{width:100%}.offer{padding:22px}.hero h1{font-size:clamp(3rem,16vw,5.4rem)}}
  </style>
</head>
<body>
  <header class="wrap topbar"><span><i class="dot"></i>${escapeHtml(eyebrow)}</span><span>${escapeHtml(headline)}</span></header>
  <main>
    <section class="hero">
      <div class="wrap hero-grid">
        <div>
          <p class="eyebrow">${escapeHtml(eyebrow)}</p>
          <h1>${escapeHtml(headline)}</h1>
          <p class="lead">${escapeHtml(objective)}</p>
          <div class="actions">
            <a class="button" href="${escapeHtml(actionUrl)}">${escapeHtml(callToAction)}</a>
            <a class="button secondary" href="#details">${escapeHtml(secondaryCta)}</a>
          </div>
        </div>
        <aside class="offer">
          <small>La proposition</small>
          <strong>${escapeHtml(offer)}</strong>
          <p>${escapeHtml(audience)}</p>
          ${price ? `<p class="price">${escapeHtml(price)}</p>` : ""}
        </aside>
      </div>
    </section>
    <section id="details">
      <div class="wrap">
        <div class="section-head"><h2>Pourquoi regarder de plus près ?</h2><p>${escapeHtml(audience)}</p></div>
        <div class="cards">${benefitCards}
        </div>
      </div>
    </section>
    <section>
      <div class="wrap">
        <div class="section-head"><h2>La suite, sans brouillard.</h2><p>Un parcours court et compréhensible pour passer de la découverte à une décision utile.</p></div>
        <ol class="steps">${stepCards}
        </ol>
        <p class="proof">${escapeHtml(proof)}</p>
      </div>
    </section>
    <section class="final" id="contact">
      <div class="wrap">
        <h2>${escapeHtml(callToAction)}</h2>
        <p>${escapeHtml(objective)}</p>
        <a class="button" href="${escapeHtml(contactUrl === "#contact" ? actionUrl : contactUrl)}">${escapeHtml(callToAction)}</a>
      </div>
    </section>
  </main>
  <footer><div class="wrap">${escapeHtml(footer)} · ${new Date().getFullYear()}</div></footer>
</body>
</html>`;

  return {
    id: `artifact-${Date.now()}`,
    type: "landing-page.html",
    title: headline,
    content,
    url: null,
    downloadUrl: null,
    mimeType: "text/html; charset=utf-8",
    createdAt: new Date().toISOString(),
    metadata: { producer: "HTML local enrichi", template: "publisher-rich-landing-v2", responsive: true, selfContained: true, sections: ["hero", "offer", "benefits", "steps", "cta"] },
  };
}

// ============================================================================
// Neon-backed tentacles — Gérard working "sans relâche" on his harvests,
// server-side, without needing a browser tab open. One Neon Postgres table
// per tentacle (mirrors a Seed), fed by the client via /api/tentacles/sync,
// worked on by either a Cron Trigger (scheduled()) or a manual nudge
// (/api/tentacles/run-cycle) — same runOneTentacle() either way, so there is
// exactly one place this logic lives, whether it fires on a timer or on
// request. This is internal work (draft text + private Canva designs in the
// user's own account) — never publishing or contacting anyone — so it stays
// autonomous under the authorization policy restored in poulpe-fiction.
// ============================================================================

function buildImprovePrompt(tentacle: TentacleRow, previous: { content: string | null } | null, groundingText: string): string {
  const parts = [
    `Graine : ${tentacle.title}`,
    `Objectif : ${tentacle.objective || "non précisé"}`,
    `Première récolte visée : ${tentacle.first_harvest || "non précisée"}`,
    `Faits vérifiés disponibles :\n${groundingText}`,
    previous?.content ? `Récolte précédente (à approfondir sans la répéter) :\n${previous.content.slice(0, 900)}` : "Aucune récolte précédente — c'est le premier passage.",
    "Produis un livrable court, concret et directement exploitable pour cette étape (angle, accroche ou premier élément de contenu).",
    "N'invente aucun fait vérifiable : pas de chiffre, pas de témoignage, pas de preuve sociale, pas de nom de personne réelle.",
    "N'invente aucun concept, protocole, méthodologie, univers narratif ou cadre fictif qui ne figure pas explicitement dans les faits vérifiés ci-dessus. Toute idée créative doit rester une reformulation ou un prolongement direct de ce qui est déjà écrit dans les faits vérifiés — jamais une nouvelle construction qui s'en éloigne.",
    previous?.content ? "\"Aller plus loin\" signifie : creuser un angle déjà présent dans les faits vérifiés avec plus de détail ou de concret — jamais ajouter un thème, un objet ou une mécanique qui n'y figure pas." : "",
  ];
  return parts.filter(Boolean).join("\n\n");
}

function buildPlayPrompt(tentacle: TentacleRow, previous: { content: string | null } | null, triedNewTool: boolean, groundingText: string): string {
  const parts = [
    `Graine : ${tentacle.title}`,
    `Objectif habituel : ${tentacle.objective || "non précisé"}`,
    `Faits vérifiés sur ce sujet (le jeu reste permis, mais toujours à propos de ce sujet-là, jamais d'un autre) :\n${groundingText}`,
    previous?.content ? `Ce qui existe déjà (pour ne pas répéter, mais librement s'en écarter) :\n${previous.content.slice(0, 600)}` : "",
    triedNewTool
      ? "Gérard vient d'essayer une nouvelle association d'outils sur cette graine (un nouvel outil Canva jamais utilisé ici) — imagine en une phrase ou deux ce que ça pourrait donner de surprenant, sans certitude, comme une hypothèse ludique."
      : "Gérard prend une pause exploratoire sur cette graine : propose un angle inattendu, un peu décalé, qu'il n'oserait pas proposer en mode sérieux.",
    "Reste honnête : n'invente aucun fait vérifiable, aucun chiffre, aucun témoignage. C'est un brouillon d'exploration, pas une récolte finale.",
    "Le jeu créatif porte sur le ton, l'angle ou la mise en scène — jamais sur la nature du produit ou du public visé : n'invente pas un autre objet, un autre public ou un autre problème que ceux des faits vérifiés ci-dessus.",
  ];
  return parts.filter(Boolean).join("\n\n");
}

async function runImproveCycle(env: Env, sql: Awaited<ReturnType<typeof getSql>>, tentacle: TentacleRow): Promise<{ seedId: string; mode: TentacleMode; status: string; diagnostics?: Record<string, unknown> }> {
  const previous = await latestIteration(sql, tentacle.seed_id);
  let mistralStatus = "not-attempted";
  let mistralError: string | null = null;
  let canvaStatus = "not-attempted";
  let canvaError: string | null = null;
  const notionApiKey = await resolveSecret(env.NOTION_API_KEY);
  const knowledge = await resolveKnowledgePackage(
    { NOTION_API_KEY: notionApiKey, NOTION_DATABASE_ID: env.NOTION_DATABASE_ID, NOTION_PAGE_ID: env.NOTION_PAGE_ID },
    [tentacle.knowledge_slug, tentacle.parcel_id, tentacle.seed_id],
  );
  let content: string | null = null;
  // Comme pour /api/production/execute : sans Knowledge Package vérifié,
  // pas d'appel Mistral. C'est ce cycle-ci, tournant seul toutes les 15
  // minutes sans supervision, qui a produit la majorité des inventions
  // complètes (concepts, publics cibles fictifs) sur des Seeds sans source
  // Notion fiable — corrigé ici à la racine plutôt que côté client seul.
  if (knowledge.verified) {
    try {
      const artifact = await executeMistralText(env, { title: tentacle.title, prompt: buildImprovePrompt(tentacle, previous, knowledge.prompt) });
      content = artifact.content;
      mistralStatus = "success";
    } catch (error) {
      mistralStatus = "error";
      mistralError = error instanceof Error ? error.message : String(error);
    }
  } else {
    mistralStatus = "skipped-unverified";
  }

  let visualUrl: string | null = null;
  let toolCombination: string | null = null;
  try {
    const canva = await executeCanvaDesign(env, tentacle.title);
    if (canva) {
      visualUrl = canva.artifact.url;
      toolCombination = `canva:${canva.toolSlug}`;
      canvaStatus = "success";
    } else {
      canvaStatus = "no-artifact";
    }
  } catch (error) {
    canvaStatus = "error";
    canvaError = error instanceof Error ? error.message : String(error);
  }

  await recordIteration(sql, { seedId: tentacle.seed_id, mode: "improve", content, visualUrl, toolCombination });
  return {
    seedId: tentacle.seed_id,
    mode: "improve",
    status: content || visualUrl ? "completed" : "skipped-no-provider",
    diagnostics: {
      knowledge: { verified: knowledge.verified, slug: knowledge.slug, source: knowledge.source },
      mistral: { status: mistralStatus, error: mistralError },
      canva: { status: canvaStatus, error: canvaError, toolCombination },
      visualUrl,
    },
  };
}

async function runPlayCycle(env: Env, sql: Awaited<ReturnType<typeof getSql>>, tentacle: TentacleRow): Promise<{ seedId: string; mode: TentacleMode; status: string }> {
  const previous = await latestIteration(sql, tentacle.seed_id);
  const notionApiKey = await resolveSecret(env.NOTION_API_KEY);
  const knowledge = await resolveKnowledgePackage(
    { NOTION_API_KEY: notionApiKey, NOTION_DATABASE_ID: env.NOTION_DATABASE_ID, NOTION_PAGE_ID: env.NOTION_PAGE_ID },
    [tentacle.knowledge_slug, tentacle.parcel_id, tentacle.seed_id],
  );
  const triedCanvaSlugs = (tentacle.tools_tried || []).filter((entry) => entry.startsWith("canva:")).map((entry) => entry.slice("canva:".length));
  let visualUrl: string | null = null;
  let toolCombination: string | null = null;
  const canva = await executeCanvaDesign(env, `${tentacle.title} · expérimentation`, { excludeSlugs: triedCanvaSlugs, requireNovel: true }).catch(() => null);
  if (canva) { visualUrl = canva.artifact.url; toolCombination = `canva:${canva.toolSlug}`; }

  let content: string | null = null;
  if (knowledge.verified) {
    try {
      const artifact = await executeMistralText(env, { title: tentacle.title, prompt: buildPlayPrompt(tentacle, previous, Boolean(toolCombination), knowledge.prompt), temperature: 0.9 });
      content = artifact.content;
    } catch (_) { /* fine — this cycle just yields whatever it managed */ }
  }
  if (!toolCombination) toolCombination = "mistral:playful-riff";

  await recordIteration(sql, { seedId: tentacle.seed_id, mode: "play", content, visualUrl, toolCombination });
  return { seedId: tentacle.seed_id, mode: "play", status: content || visualUrl ? "completed" : "skipped-no-provider" };
}

// Roughly one cycle in four is play/dream/experiment rather than a serious
// improvement pass — Gérard stays "rêveur, joueur et inventif" instead of
// only ever grinding on the same objective.
function decideMode(): TentacleMode {
  return Math.random() < 0.25 ? "play" : "improve";
}

// One tentacle per invocation by default — Cloudflare caps subrequests per
// invocation, and a single "improve" pass (Mistral + Canva discovery/
// execute + several Neon queries) already uses a meaningful slice of that
// budget; a full sweep across tentacles happens over successive Cron ticks
// (every 15min) instead of all at once, and each tentacle's own cooldown
// (20min-6h) means most ticks only have one or two candidates due anyway.
async function runTentacleCycle(env: Env, options: { limit?: number } = {}): Promise<{ processed: number; results: Array<{ seedId: string; mode: TentacleMode; status: string }> }> {
  if (!(await isDatabaseConfigured(env))) return { processed: 0, results: [] };
  const sql = await getSql(env);
  await ensureSchema(sql);
  const due = await listDueTentacles(sql, options.limit ?? 1);
  const results: Array<{ seedId: string; mode: TentacleMode; status: string }> = [];
  for (const tentacle of due) {
    try {
      const mode = decideMode();
      const result = mode === "play" ? await runPlayCycle(env, sql, tentacle) : await runImproveCycle(env, sql, tentacle);
      results.push(result);
    } catch (error) {
      results.push({ seedId: tentacle.seed_id, mode: "improve", status: `error: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  return { processed: results.length, results };
}

// One-time cleanup: null out the visual_url on every stored iteration that
// still carries a pre-fix fake Canva link (canva.com/design/log_.../edit —
// Composio's own execution-trace id, not a real design, see 859d2ac2). Only
// touches visual_url; the generated text content is untouched. Safe to
// call more than once (matches nothing the second time).
app.post("/api/tentacles/purge-broken-visuals", async (c) => {
  if (!(await isDatabaseConfigured(c.env))) return c.json({ configured: false, purged: 0 });
  try {
    const sql = await getSql(c.env);
    await ensureSchema(sql);
    const rows = await sql`
      UPDATE tentacle_iterations
      SET visual_url = NULL
      WHERE visual_url LIKE '%/design/log\_%' ESCAPE '\'
      RETURNING id
    `;
    return c.json({ configured: true, purged: rows.length });
  } catch (error) {
    return c.json({ status: "failed", error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

app.post("/api/tentacles/sync", async (c) => {
  if (!(await isDatabaseConfigured(c.env))) return c.json({ status: "waiting-authorization", code: "DATABASE_NOT_CONFIGURED", error: "DATABASE_URL n'est pas configuré dans Publisher." }, 409);
  const body = (await c.req.json().catch(() => ({}))) as { seeds?: unknown };
  const seeds = Array.isArray(body.seeds) ? body.seeds : [];
  const inputs: TentacleSeedInput[] = seeds.map((raw) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    return {
      seedId: String(item.seedId ?? item.id ?? ""),
      parcelId: String(item.parcelId ?? ""),
      title: String(item.title ?? ""),
      objective: item.objective ? String(item.objective) : undefined,
      firstHarvest: item.firstHarvest ? String(item.firstHarvest) : undefined,
      knowledgeSlug: item.knowledgeSlug ? String(item.knowledgeSlug) : undefined,
    };
  });
  try {
    const sql = await getSql(c.env);
    await ensureSchema(sql);
    const count = await upsertTentacles(sql, inputs);
    return c.json({ status: "ok", synced: count });
  } catch (error) {
    return c.json({ status: "failed", error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

app.get("/api/tentacles/state", async (c) => {
  if (!(await isDatabaseConfigured(c.env))) return c.json({ configured: false, tentacles: [] });
  try {
    const sql = await getSql(c.env);
    await ensureSchema(sql);
    const rows = await sql`SELECT seed_id, parcel_id, title, mode, iteration_count, last_run_at, cooldown_until, tools_tried FROM tentacles ORDER BY updated_at DESC LIMIT 100`;
    return c.json({ configured: true, tentacles: rows });
  } catch (error) {
    return c.json({ status: "failed", error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

// Full iteration content (text + visual URL), not just tentacle summaries —
// this is what poulpe-fiction's client reads to actually mirror the Neon
// loop's output into the Garden (see neon-harvest-sync.js). Without this,
// runTentacleCycle() keeps producing real work server-side that no one
// ever sees, which is exactly what it was doing until this route existed.
/**
 * Sonde Canva, en lecture seule.
 *
 * Le cycle appelle executeCanvaDesign derrière un `.catch(() => null)` : depuis
 * des dizaines d'itérations, Canva échoue et l'erreur est jetée, si bien que
 * visual_url reste null sans que personne sache pourquoi. Cette route refait
 * exactement la même tentative et **renvoie l'erreur telle quelle**.
 *
 * Volontairement en GET, et sans écriture : aucune itération n'est enregistrée,
 * aucun cooldown touché. Elle doit être ouvrable depuis un simple navigateur —
 * y compris un téléphone, où lancer un POST n'est pas praticable.
 */
app.get("/api/tentacles/diagnose-canva", async (c) => {
  const title = c.req.query("title") || "Diagnostic Canva";

  if (!(await isComposioConfigured(c.env))) {
    return c.json({ configured: false, canvaError: "COMPOSIO_API_KEY n'est pas configuré." });
  }

  const accounts = await listComposioConnectedAccounts(c.env).catch(() => []);
  const account = accountFor(accounts, "canva");
  const tools = await listComposioTools(c.env, "canva").catch(() => []);
  const candidates = selectCanvaCreateTools(tools);

  const base = {
    configured: true,
    composioUserId: composioUserId(c.env),
    canvaAccount: account ? { id: account.id, status: account.status } : null,
    discoveredToolCount: tools.length,
    // L'ordre compte : c'est celui dans lequel le cycle les essaie.
    creationCandidates: candidates.slice(0, 5).map((tool) => tool.slug),
    candidateDiagnostics: candidates.slice(0, 5).map((tool) => ({
      slug: tool.slug,
      inputSchema: tool.inputSchema,
      required: schemaRequired(tool),
      propertyNames: Object.keys(schemaProperties(tool)),
      constructedArguments: canvaArguments(tool, title),
    })),
  };

  if (!account) {
    return c.json({ ...base, canvaStatus: "no-account", canvaError: "Aucun compte Canva actif pour cet identifiant utilisateur." });
  }

  try {
    const attemptFailures: Array<{ toolSlug: string; error: string }> = [];
    const result = await executeCanvaDesign(c.env, title, { onAttemptFailure: (failure) => attemptFailures.push(failure) });
    return result
      ? c.json({ ...base, canvaStatus: "success", toolSlug: result.toolSlug, artifactUrl: result.artifact.url, attemptFailures })
      : candidates.length
        ? c.json({ ...base, canvaStatus: "generation-failed", canvaError: "Les outils de création ont été trouvés mais aucune tentative n’a produit d’artefact Canva.", attemptFailures })
        : c.json({ ...base, canvaStatus: "no-candidate", canvaError: "Aucun outil de création exploitable parmi les outils découverts.", attemptFailures });
  } catch (error) {
    // Le message brut de Composio : précisément ce que le cycle avalait.
    return c.json({ ...base, canvaStatus: "error", canvaError: error instanceof Error ? error.message : String(error) });
  }
});

type HarvestEditorialClass = "creative-promotable" | "internal" | "research" | "commercial";

function extractSocialCopy(content: string | null): { text: string; strategy: string } {
  const source = String(content ?? "").trim();
  if (!source) return { text: "", strategy: "empty" };

  const numbered = [...source.matchAll(/^\s*1\.\s+(.+)$/gim)];
  if (numbered[0]?.[1]?.trim()) return { text: numbered[0][1].trim(), strategy: "first-explicit-angle" };

  const central = source.match(/\*{0,2}Accroche centrale\*{0,2}\s*:\s*\n?\s*\*?["“]?([^\n*"”]+)["”]?\*?/i);
  if (central?.[1]?.trim()) return { text: central[1].trim(), strategy: "central-hook" };

  const firstContent = source.match(/(?:Premier contenu exploitable|Format TikTok\/Reels[^\n]*)\s*:?\s*\n+([\s\S]{1,500}?)(?=\n\n|\n#{1,4}\s|$)/i);
  if (firstContent?.[1]?.trim()) {
    const cleaned = firstContent[1].replace(/^\s*[*>"“”]+|[*>"“”]+\s*$/g, "").trim();
    if (cleaned) return { text: cleaned, strategy: "explicit-social-content" };
  }

  return { text: source, strategy: "source-fallback" };
}

function classifyHarvestForSocial(row: {
  title: string; content: string | null; seed_id: string | null; parcel_id: string;
  url: string | null; download_url: string | null; type: string | null;
}) {
  const text = [row.title, row.content, row.seed_id, row.parcel_id].filter(Boolean).join("\n").toLowerCase();
  const reasons: string[] = [];
  let editorialClass: HarvestEditorialClass = "creative-promotable";

  const commercial = /(prospect|prospection|préqualification|qualification commerciale|lead|crm|décisionnaire|score sur 100|message de premier contact)/i.test(text);
  const internal = /(journal de bord autonome|traçabilité|protocole|diagnostic|outil\/source|validation technique|workflow|publisher|observatoire)/i.test(text);
  const research = /(hypothèse|recherche|brainstorm|à vérifier|test a\/b|prochaine étape suggérée|visuel suggéré|maquette)/i.test(text);
  const knowledgeMissing = /(knowledge pack vérifié|manque encore d.un knowledge pack|rassembler les faits vérifiés)/i.test(text);
  const hasReadyAngles = /(trois angles immédiatement exploitables|premier contenu exploitable|accroche centrale|accroche primaire|format tiktok|format story instagram|bookstagram|booktok)/i.test(text);

  if (commercial) {
    editorialClass = "commercial";
    reasons.push("matière commerciale/prospection, pas un contenu social de marque prêt à diffuser");
  } else if (internal) {
    editorialClass = "internal";
    reasons.push("document de travail ou de traçabilité interne");
  } else if (research) {
    editorialClass = "research";
    reasons.push("hypothèse, recherche ou brief nécessitant encore une transformation éditoriale");
  }

  const mediaUrl = row.download_url || row.url;
  const canvaEditLink = Boolean(mediaUrl && /canva\.com\/design\/.+\/edit(?:$|[?#])/i.test(mediaUrl));
  const hasDirectMedia = Boolean(mediaUrl && !canvaEditLink && /\.(?:png|jpe?g|webp|gif|mp4|mov|webm)(?:$|[?#])/i.test(mediaUrl));
  const hasContent = Boolean(row.content?.trim());

  if (!hasContent) reasons.push("aucun contenu textuel exploitable");
  if (canvaEditLink) reasons.push("le média est un lien d'édition Canva, pas un fichier publiable");
  if (!mediaUrl) reasons.push("aucun média associé");

  let score = editorialClass === "creative-promotable" ? 60 : editorialClass === "research" ? 25 : 10;
  if (hasContent) score += 10;
  if (hasDirectMedia) score += 25;
  if (canvaEditLink) score -= 15;
  score = Math.max(0, Math.min(100, score));

  if (knowledgeMissing) {
    score -= 35;
    reasons.push("Knowledge Pack non vérifié : récolte de cadrage, pas publication prête");
  }
  if (hasReadyAngles) score += 15;
  score = Math.max(0, Math.min(100, score));

  const eligible = editorialClass === "creative-promotable" && hasContent && !knowledgeMissing && hasReadyAngles;
  if (eligible && reasons.length === 0) reasons.push("matière créative avec angle social explicite, exploitable sans nouvelle génération");

  return { editorialClass, eligible, score, reasons, signals: { knowledgeMissing, hasReadyAngles }, media: { url: mediaUrl, direct: hasDirectMedia, canvaEditLink } };
}

app.get("/api/garden/harvests/social-candidates", async (c) => {
  if (!(await isDatabaseConfigured(c.env))) return c.json({ configured: false, candidates: [] }, 503);
  try {
    const sql = await getSql(c.env);
    const limit = Math.min(Math.max(Number(c.req.query("limit")) || 100, 1), 200);
    const rows = await listGardenHarvests(sql, { limit, reusableOnly: true });
    const evaluated = rows.map((row) => ({ row, evaluation: classifyHarvestForSocial(row) }));
    const candidates = evaluated
      .filter(({ evaluation }) => evaluation.eligible)
      .sort((a, b) => b.evaluation.score - a.evaluation.score)
      .map(({ row, evaluation }) => ({
        harvestId: row.id,
        seedId: row.seed_id,
        parcelId: row.parcel_id,
        title: row.title,
        content: row.content,
        mediaUrl: row.download_url || row.url,
        type: row.type,
        status: row.status,
        createdAt: row.created_at,
        editorial: evaluation,
      }));
    const rejected = evaluated
      .filter(({ evaluation }) => !evaluation.eligible)
      .map(({ row, evaluation }) => ({
        harvestId: row.id,
        seedId: row.seed_id,
        title: row.title,
        editorial: evaluation,
      }));
    return c.json({
      configured: true,
      contract: "garden-social-candidates-v1",
      policy: "reuse-first-deterministic-no-ai",
      scanned: rows.length,
      candidateCount: candidates.length,
      rejectedCount: rejected.length,
      candidates,
      rejected,
    });
  } catch (error) {
    return c.json({ status: "failed", error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

app.get("/api/garden/harvests", async (c) => {
  if (!(await isDatabaseConfigured(c.env))) return c.json({ configured: false, harvests: [] }, 503);
  try {
    const sql = await getSql(c.env);
    const limit = Math.min(Math.max(Number(c.req.query("limit")) || 50, 1), 200);
    const seedId = c.req.query("seedId")?.trim() || undefined;
    const includeAll = c.req.query("all") === "true";
    const rows = await listGardenHarvests(sql, { limit, seedId, reusableOnly: !includeAll });
    return c.json({
      configured: true,
      contract: "garden-reusable-harvests-v1",
      selectionPolicy: includeAll ? "all" : "reusable-existing-first",
      count: rows.length,
      harvests: rows.map((row) => ({
        harvestId: row.id,
        seedId: row.seed_id,
        parcelId: row.parcel_id,
        operationId: row.operation_id,
        title: row.title,
        content: row.content,
        mediaUrl: row.download_url || row.url,
        sourceUrl: row.url,
        type: row.type,
        status: row.status,
        source: row.source,
        createdAt: row.created_at,
        syncedAt: row.synced_at,
      })),
    });
  } catch (error) {
    return c.json({ status: "failed", error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

app.post("/api/garden/harvests/sync", async (c) => {
  if (!(await isDatabaseConfigured(c.env))) return c.json({ configured: false, synced: 0 }, 503);
  try {
    const body = await c.req.json<{ harvests?: unknown[] }>().catch(() => ({ harvests: [] }));
    const raw = Array.isArray(body.harvests) ? body.harvests.slice(0, 1000) : [];
    const harvests = raw.flatMap((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const item = value as Record<string, unknown>;
      const id = String(item.id ?? "").trim();
      const parcelId = String(item.parcelId ?? "").trim();
      const title = String(item.title ?? "").trim();
      if (!id || !parcelId || !title) return [];
      return [{
        id, parcelId, title,
        seedId: item.seedId ? String(item.seedId) : null,
        operationId: item.operationId ? String(item.operationId) : null,
        content: item.content ? String(item.content) : null,
        url: item.url ? String(item.url) : null,
        downloadUrl: item.downloadUrl ? String(item.downloadUrl) : null,
        type: item.type ? String(item.type) : null,
        status: item.status ? String(item.status) : null,
        createdAt: item.createdAt ? String(item.createdAt) : null,
      }];
    });
    const sql = await getSql(c.env);
    const synced = await upsertGardenHarvests(sql, harvests);
    return c.json({ status: "ok", received: raw.length, synced });
  } catch (error) {
    return c.json({ status: "failed", error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

app.get("/api/tentacles/iterations", async (c) => {
  if (!(await isDatabaseConfigured(c.env))) return c.json({ configured: false, iterations: [] });
  try {
    const sql = await getSql(c.env);
    await ensureSchema(sql);
    const limit = Math.min(Number(c.req.query("limit")) || 200, 500);
    const rows = await sql`
      SELECT i.id, i.seed_id, t.parcel_id, t.title, i.iteration_number, i.mode, i.content, i.visual_url, i.tool_combination, i.created_at
      FROM tentacle_iterations i
      JOIN tentacles t ON t.seed_id = i.seed_id
      ORDER BY i.created_at DESC
      LIMIT ${limit}
    `;
    return c.json({ configured: true, iterations: rows });
  } catch (error) {
    return c.json({ status: "failed", error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

// Manual nudge — runs the exact same cycle the Cron Trigger runs, so this
// can be verified on demand instead of waiting for the schedule to fire.
app.post("/api/tentacles/run-cycle", async (c) => {
  try {
    // Safety gate: autonomous/manual tentacle cycles must not silently spend
    // Mistral quota. AI generation is owned by Octopus; Publisher remains the
    // adapter/memory surface. Keep this endpoint read/write-safe until the
    // cultivate path is routed through an Octopus mission.
    const source = String((await c.req.json<{ source?: string }>().catch(() => ({}))).source || "").trim();
    if (source === "poulpe-fiction-gerard-cycle") {
      return c.json({
        status: "blocked",
        code: "DIRECT_AI_BYPASS_BLOCKED",
        reason: "Gerard cultivate must use Octopus for AI generation; direct Publisher tentacle inference is disabled.",
        processed: 0,
        results: [],
      }, 409);
    }
    const requestedLimit = Number(c.req.query("limit"));
    const result = await runTentacleCycle(c.env, { limit: Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 3) : 1 });
    return c.json({ status: "ok", ...result });
  } catch (error) {
    return c.json({ status: "failed", error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

// ============================================================================
// Octopus adapter surface
//
// Octopus executes only its seven intrinsic capabilities itself; everything
// else needs a registered external adapter. Publisher used to provide that from
// the Render api-server, whose host is dead — so the deployed Octopus has had
// no live executor at all. These routes move that surface here, where the
// Worker is already deployed and already has a Cron Trigger.
// ============================================================================

function publisherPublicUrl(env: Env): string {
  return (env.PUBLISHER_PUBLIC_URL || "https://blacklace-publisher-worker.benoitlubert.workers.dev").trim();
}

function octopusEngineUrl(env: Env): string {
  return (env.OCTOPUS_ENGINE_URL || DEFAULT_OCTOPUS_URL).trim();
}

async function knowledgeEnvFor(env: Env) {
  return {
    DATABASE_URL: env.DATABASE_URL,
    NOTION_API_KEY: await resolveSecret(env.NOTION_API_KEY),
    NOTION_DATABASE_ID: env.NOTION_DATABASE_ID,
    NOTION_PAGE_ID: env.NOTION_PAGE_ID,
  };
}

/**
 * Met les diagnostics Notion à la forme attendue par la carte « Source de
 * connaissance » du dashboard (schéma KnowledgeSourcePreview de
 * lib/api-spec/openapi.yaml). Exportée pour être testée directement : c'est
 * la seule logique de la route, le reste n'est que du transport.
 */
export function knowledgeSourcePreview(diagnostics: NotionDiagnostics) {
  return {
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
  };
}

// La carte « Source de connaissance » du dashboard appelait cette route
// depuis l'api-server Render, mort depuis. Seul le Worker est déployé, il ne
// l'exposait pas : 404 permanent, carte en erreur. Portée telle quelle depuis
// artifacts/api-server/src/routes/connectors.ts.
//
// fetchBlacklaceKnowledgeWithDiagnostics ne lève jamais : sans clé Notion, ou
// si l'API Notion échoue, elle renvoie le mock avec la raison dans `error`.
// La route répond donc toujours 200 — la carte doit afficher « Mock » et sa
// cause, pas une erreur de chargement.
app.get("/api/connectors/knowledge-source/preview", async (c) => {
  const diagnostics = await knowledgeSourceDiagnostics(await knowledgeEnvFor(c.env));
  return c.json(knowledgeSourcePreview(diagnostics));
});

/** Health of *this adapter* — distinct from the octopus-witness view above. */
app.get("/api/diagnostics/database", async (c) => {
  return c.json(await databaseBindingDiagnostics(c.env));
});

type PublisherCapability = "content.plan" | "content.write" | "content.repurpose" | "social.publish" | "visual.generate" | "video.generate" | "analytics.read";

function capabilitiesFromToolText(value: string): PublisherCapability[] {
  const text = String(value || "").toLowerCase();
  const rules: Array<[PublisherCapability, RegExp]> = [
    ["content.plan", /content plan|planning|calendar/],
    ["content.write", /writing|draft|post generator|generate.*post|content creation|text generation/],
    ["content.repurpose", /repurpose|various formats|multiple formats/],
    ["social.publish", /publish|publishing|multi-platform|social network|social media manager/],
    // Generation must be an action of the tool itself. Merely mentioning
    // "image", "design" or "create documents" in a list/get description is
    // not evidence that the tool can generate a visual.
    ["visual.generate", /text.?to.?image|image generation|image generator|visual generation|generate(?:s|d|ing)?[^.]{0,50}(?:image|visual)|(?:create|creates|creating)[^.]{0,40}(?:image|visual)/],
    ["video.generate", /text.?to.?video|video generation|generate(?:s|d|ing)?[^.]{0,50}video|reel generator/],
    ["analytics.read", /analytics|performance|insights/],
  ];
  return rules.filter(([, pattern]) => pattern.test(text)).map(([capability]) => capability);
}

function executableToolPack(tool: ComposioTool, connected: boolean) {
  const capabilities = capabilitiesFromToolText(toolText(tool));
  return {
    contract: "publisher-tool-pack-v1",
    id: `composio:${tool.toolkitSlug}:${tool.slug}`,
    role: "tool-pack",
    provider: "composio",
    toolkit: tool.toolkitSlug,
    toolSlug: tool.slug,
    name: tool.name,
    description: tool.description,
    capabilities,
    executable: connected && capabilities.length > 0,
    connectionRequired: !connected,
    inputSchema: tool.inputSchema,
    provenance: { source: "live-composio-inventory", discoveredAt: new Date().toISOString() },
  };
}

// Live capability registry: Publisher turns connected tool inventories into
// reusable Tool Packs. Gérard/Poulpe Fiction can ask for a capability without
// hard-coding a vendor. This route only discovers/qualifies; it executes nothing.
// Capability-gap discovery: when Publisher has no connected executable pack,
// it formulates a vendor-neutral search mission for the Observatory instead of
// silently falling back to an unrelated tool.
app.get("/api/observatory/capability-gap", async (c) => {
  const capability = String(c.req.query("capability") || "").trim() as PublisherCapability;
  const allowed: PublisherCapability[] = ["content.plan","content.write","content.repurpose","social.publish","visual.generate","video.generate","analytics.read"];
  if (!allowed.includes(capability)) return c.json({ status: "rejected", error: "Unknown capability." }, 400);
  try {
    const accounts = await listComposioConnectedAccounts(c.env);
    const toolkits = [...new Set(accounts.filter((account) => isActiveComposioStatus(account.status)).map((account) => account.toolkitSlug))];
    const matches: any[] = [];
    for (const toolkit of toolkits) {
      try {
        for (const tool of await listComposioTools(c.env, toolkit)) {
          const pack = executableToolPack(tool, Boolean(accountFor(accounts, toolkit)));
          if (pack.executable && pack.capabilities.includes(capability)) matches.push(pack);
        }
      } catch (_) {}
    }
    if (matches.length) return c.json({ status: "covered", contract: "publisher-capability-gap-v1", capability, matches, discoveryRequired: false });

    const queries: Record<PublisherCapability, string> = {
      "visual.generate": "AI image generation API text to image tool developer API Mistral image generation",
      "video.generate": "AI video generation API text to video developer tool",
      "social.publish": "social media publishing scheduling API tool",
      "analytics.read": "social media analytics API tool",
      "content.plan": "AI content planning API tool",
      "content.write": "AI text generation API tool",
      "content.repurpose": "AI content repurposing API tool",
    };
    return c.json({
      status: "gap",
      contract: "publisher-capability-gap-v1",
      capability,
      discoveryRequired: true,
      connectedMatches: 0,
      mission: {
        role: "tool-discovery",
        query: queries[capability],
        acceptance: ["documented capability match", "developer/API access", "executable integration path", "no inferred capability from marketing nouns"],
        nextEndpoint: "/api/observatory/discovery/preview",
      },
    });
  } catch (error) {
    return c.json({ status: "failed", contract: "publisher-capability-gap-v1", capability, error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

app.get("/api/observatory/tool-packs", async (c) => {
  try {
    if (!(await isComposioConfigured(c.env))) return c.json({ status: "unavailable", contract: "publisher-tool-registry-v1", packs: [], error: "Composio not configured." }, 503);
    const requested = String(c.req.query("capability") || "").trim();
    const accounts = await listComposioConnectedAccounts(c.env);
    const toolkits = [...new Set(accounts.filter((account) => isActiveComposioStatus(account.status)).map((account) => account.toolkitSlug))];
    const packs: any[] = [];
    for (const toolkit of toolkits) {
      try {
        const tools = await listComposioTools(c.env, toolkit);
        for (const tool of tools) {
          const pack = executableToolPack(tool, Boolean(accountFor(accounts, toolkit)));
          if (!pack.capabilities.length) continue;
          if (requested && !pack.capabilities.includes(requested as PublisherCapability)) continue;
          packs.push(pack);
        }
      } catch (_) {
        // One broken toolkit must not hide the rest of the registry.
      }
    }
    return c.json({
      status: "ok",
      contract: "publisher-tool-registry-v1",
      requestedCapability: requested || null,
      count: packs.length,
      packs,
      selectionPolicy: "connected-capability-match-first",
      executable: false,
    });
  } catch (error) {
    return c.json({ status: "failed", contract: "publisher-tool-registry-v1", packs: [], error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

app.get("/api/observatory/discovery/schema", async (c) => {
  try {
    const payload = await composioRequest(c.env, "/tools?toolkit_slug=composio_search&limit=100&toolkit_versions=latest");
    const tools = extractItems(payload).map((item) => {
      const record = asRecord(item);
      const schema = asRecord(record.input_parameters ?? record.input_schema ?? record.inputSchema ?? record.parameters ?? record.schema);
      return {
        slug: stringValue(record.slug ?? record.name ?? record.tool_slug ?? record.toolSlug),
        name: stringValue(record.name ?? record.display_name),
        toolkit: toolkitFrom(record),
        description: stringValue(record.description),
        inputSchema: schema,
      };
    }).filter((tool) => {
      const slug = tool.slug.toUpperCase();
      const haystack = [tool.slug, tool.name, tool.description].filter(Boolean).join(" ").toLowerCase();
      return (
        slug === "COMPOSIO_SEARCH_WEB" ||
        slug === "COMPOSIO_SEARCH_TAVILY" ||
        slug === "COMPOSIO_SEARCH_DUCK_DUCK_GO" ||
        slug === "COMPOSIO_SEARCH_GOOGLE" ||
        slug === "COMPOSIO_SEARCH_BING" ||
        (slug.startsWith("COMPOSIO_SEARCH_") &&
          /web|internet|tavily|duck.?duck.?go|google|bing|search engine/.test(haystack))
      );
    });
    return c.json({ status: "ok", executable: false, tools });
  } catch (error) {
    return c.json({ status: "failed", executable: false, error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

app.get("/api/observatory/discovery/account", async (c) => {
  try {
    const accounts = await listComposioConnectedAccounts(c.env);
    const searchAccounts = accounts
      .filter((account) => account.toolkitSlug === "composio-search" || account.toolkitSlug === "composio_search")
      .map((account) => ({ id: account.id, toolkit: account.toolkitSlug, status: account.status, active: isActiveComposioStatus(account.status) }));
    return c.json({
      status: "ok",
      configured: await isComposioConfigured(c.env),
      userIdConfigured: Boolean(await resolveSecret(c.env.COMPOSIO_USER_ID)),
      searchAccountCount: searchAccounts.length,
      searchAccounts,
      executable: false,
    });
  } catch (error) {
    return c.json({
      status: "failed",
      executable: false,
      error: error instanceof Error ? error.message : String(error),
    }, 502);
  }
});

app.post("/api/observatory/discovery/preview", async (c) => {
  try {
    const body = await c.req.json<{ query?: string }>().catch(() => ({}));
    const query = String(body.query || "").trim();
    if (!query) return c.json({ status: "failed", executable: false, error: "query is required" }, 400);

    const preview = await composioRequest(c.env, "/tools/execute/COMPOSIO_SEARCH_WEB", {
      method: "POST",
      body: JSON.stringify({
        arguments: { query },
        user_id: await composioUserId(c.env),
        version: "latest",
      }),
    });

    const previewRecord = asRecord(preview);
    const data = asRecord(previewRecord.data);
    const citations = Array.isArray(data.citations) ? data.citations : [];
    const answer = stringValue(data.answer);
    const citedDescriptions = new Map<number, string>();
    const citationPattern = /(?:^|\\s)([^[]*?)\\s*\\[(\\d+)](?=\\s|$)/g;
    for (const match of answer.matchAll(citationPattern)) {
      const citationNumber = Number.parseInt(match[2], 10);
      const description = String(match[1] || "").trim();
      if (Number.isFinite(citationNumber) && description) citedDescriptions.set(citationNumber, description);
    }
    const candidates = citations
      .map((citation, index) => {
        const item = asRecord(citation);
        const url = stringValue(item.url ?? item.id);
        const title = stringValue(item.title);
        if (!url || !title) return null;
        const citedDescription = citedDescriptions.get(index + 1) ?? "";
        return {
          title,
          url,
          description: stringValue(item.description ?? item.snippet) || citedDescription,
          publishedDate: stringValue(item.publishedDate ?? item.published_date),
          image: stringValue(item.image),
          provenance: {
            engine: "COMPOSIO_SEARCH_WEB",
            query,
          },
        };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
      .slice(0, 5);

    return c.json({
      status: "ok",
      executable: false,
      persisted: false,
      engine: "COMPOSIO_SEARCH_WEB",
      limit: 5,
      query,
      candidates,
      preview,
    });
  } catch (error) {
    return c.json({
      status: "failed",
      executable: false,
      persisted: false,
      error: error instanceof Error ? error.message : String(error),
    }, 502);
  }
});

app.post("/api/observatory/discovery/enrich", async (c) => {
  try {
    const body = await c.req.json<{ url?: string }>().catch(() => ({}));
    const url = String(body.url || "").trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return c.json({ status: "rejected", executable: false, persisted: false, code: "INVALID_URL", error: "A public http(s) url is required." }, 400);
    }

    const preview = await composioRequest(c.env, "/tools/execute/COMPOSIO_SEARCH_FETCH_URL_CONTENT", {
      method: "POST",
      body: JSON.stringify({
        arguments: { urls: [url], text: true, summary: true, max_characters: 12000 },
        user_id: await composioUserId(c.env),
        version: "latest",
      }),
    });

    return c.json({
      status: "ok",
      executable: false,
      persisted: false,
      engine: "COMPOSIO_SEARCH_FETCH_URL_CONTENT",
      url,
      preview,
    });
  } catch (error) {
    return c.json({
      status: "failed",
      executable: false,
      persisted: false,
      error: error instanceof Error ? error.message : String(error),
    }, 502);
  }
});

app.post("/api/observatory/discovery/accept", async (c) => {
  const body = await c.req.json<{
    candidate?: { title?: string; url?: string; description?: string; publishedDate?: string; image?: string };
    decision?: string;
    autonomous?: boolean;
  }>().catch(() => ({}));
  const candidate = body.candidate;
  const title = String(candidate?.title || "").trim();
  const url = String(candidate?.url || "").trim();
  if (!candidate || !title || !url) {
    return c.json({ status: "rejected", persisted: false, code: "INVALID_CANDIDATE", error: "candidate.title and candidate.url are required" }, 400);
  }
  const autonomous = body.autonomous === true;
  if (!autonomous && body.decision !== "watch") {
    return c.json({ status: "waiting-authorization", persisted: false, code: "WATCH_CONFIRMATION_REQUIRED", error: "Explicit decision=watch is required unless autonomous discovery ingestion is requested." }, 409);
  }
  if (!(await isDatabaseConfigured(c.env))) {
    return c.json({ status: "waiting-authorization", persisted: false, code: "DATABASE_NOT_CONFIGURED", error: "DATABASE_URL n'est pas configuré dans Publisher." }, 409);
  }

  try {
    const sql = await getSql(c.env);
    await ensureObservatorySchema(sql);
    const description = String(candidate.description || "").trim();
    const searchable = `${title} ${description}`.toLowerCase();
    const capabilityRules: Array<[string, RegExp]> = [
      ["content.plan", /content plan|planning|month of content|calendar/],
      ["content.write", /writing|draft|post generator|generate.*post|content creation/],
      ["content.repurpose", /repurpose|single idea|one idea|various formats|multiple formats/],
      ["social.publish", /publish|publishing|multi-platform|social network|social media manager/],
      ["visual.generate", /infographic|carousel|image|visual/],
      ["video.generate", /video|reel/],
      ["analytics.read", /analytics|performance/],
    ];
    const capabilities = capabilityRules.filter(([, pattern]) => pattern.test(searchable)).map(([capability]) => capability);
    const source = await upsertObservatorySource(sql, {
      kind: "web",
      value: url,
      name: title,
      category: "external-discovery",
      summary: description || undefined,
      tags: ["external-discovery", "composio-search", ...capabilities],
      pack: {
        role: "discovered-tool",
        capabilities,
        provenance: {
          engine: "COMPOSIO_SEARCH_WEB",
          publishedDate: String(candidate.publishedDate || "").trim() || null,
          image: String(candidate.image || "").trim() || null,
        },
      },
    });
    const watched = await setObservatoryDecision(sql, source.id, "watch");
    return c.json({
      status: "ok",
      persisted: true,
      decision: "watch",
      autonomous,
      source: observatorySourceResponse(watched ?? source),
    });
  } catch (error) {
    return c.json({ status: "failed", persisted: false, error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

app.get("/api/adapter/health", async (c) => {
  const textProducerConfigured = Boolean(await mistralApiKey(c.env));
  return c.json({
    status: "ok",
    adapterId: PUBLISHER_ADAPTER_ID,
    contract: ADAPTER_EXECUTION_CONTRACT,
    runtime: "cloudflare-worker",
    capabilities: [...PUBLISHER_ADAPTER_CAPABILITIES],
    executeUrl: `${publisherPublicUrl(c.env)}/api/octopus-adapter/execute`,
    textProducerConfigured,
  });
});

app.post("/api/octopus-adapter/execute", async (c) => {
  const envelope = await c.req.json<OctopusAdapterEnvelope>().catch(() => ({}) as OctopusAdapterEnvelope);
  const result = await executeAdapterMission(envelope, {
    generateText: (request) => executeMistralText(c.env, request),
    knowledgeEnv: await knowledgeEnvFor(c.env),
  });
  // Always 200: the outcome travels in `status`, which is what Octopus reads.
  // A non-2xx would be recorded as an adapter transport failure and lose the
  // readable summary.
  return c.json(result);
});

/** Manual registration, for when waiting for the next cron tick is too slow. */
app.post("/api/adapter/register", async (c) => {
  const outcome = await registerWithOctopus({
    octopusUrl: octopusEngineUrl(c.env),
    publicBaseUrl: publisherPublicUrl(c.env),
    fetcher: c.env.OCTOPUS_ENGINE ? c.env.OCTOPUS_ENGINE.fetch.bind(c.env.OCTOPUS_ENGINE) as typeof fetch : undefined,
  });
  return c.json(outcome, outcome.registered ? 200 : 502);
});

// Sends a neutral observation (no business meaning) into Octopus's
// observation.receive capability, and returns the universal knowledge it
// already holds about related observations, translated into a
// Publisher-specific signal. Ported from the dead Render api-server (see
// octopus-observation.ts's header comment) — this is what
// artifacts/blacklace-publisher's Radar/Observatoire calls.
app.post("/api/octopus-adapter/observe", async (c) => {
  const input = await c.req.json<PublisherObservationInput>().catch(() => null);
  if (!input || !input.kind || !input.title) {
    return c.json({ status: "rejected", code: "INVALID_OBSERVATION", summary: "Publisher requires a neutral observation with kind and title." }, 400);
  }
  try {
    const result = await observeWithOctopus(octopusEngineUrl(c.env), input);
    return c.json(result);
  } catch (error) {
    return c.json({ status: "failed", code: "OCTOPUS_UNAVAILABLE", summary: error instanceof Error ? error.message : "Octopus could not process the observation." }, 502);
  }
});

// ---------------------------------------------------------------------------
// Observatoire : sources persistées dans Neon.
//
// Avant ces routes, "ajouter une source" depuis le dashboard n'écrivait que
// dans le localStorage du navigateur. Rien n'atteignait jamais le serveur,
// donc le job nocturne (Autonomous Knowledge Observatory) ne voyait aucune
// source utilisateur et les compteurs du tableau de bord restaient à 0 dès
// qu'on changeait de navigateur ou d'appareil.
//
// L'ordre compte : on écrit d'abord en base, on interroge Octopus ensuite.
// Une panne d'Octopus ne doit plus faire perdre la source.
// ---------------------------------------------------------------------------

function observatorySourceResponse(row: ObservatorySourceRow) {
  return {
    id: row.id,
    sourceKey: row.source_key,
    kind: row.kind,
    value: row.value,
    name: row.name,
    category: row.category,
    summary: row.summary,
    averageConfidence: Number(row.average_confidence ?? 0),
    tags: row.tags ?? [],
    decision: row.decision,
    observationCount: row.observation_count,
    pack: row.pack ?? null,
    octopus: row.octopus ?? null,
    firstObservedAt: row.first_observed_at,
    lastObservedAt: row.last_observed_at,
    processedAt: row.processed_at,
  };
}

app.post("/api/observatory/sources", async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | (ObservatorySourceInput & {
        language?: string;
        features?: string[];
        patterns?: string[];
        recommendations?: string[];
      })
    | null;

  if (!body || typeof body.value !== "string" || !body.value.trim() || typeof body.kind !== "string" || !body.kind.trim()) {
    return c.json({ status: "rejected", code: "INVALID_SOURCE", error: "Une source requiert un `kind` et une `value`." }, 400);
  }

  if (!(await isDatabaseConfigured(c.env))) {
    return c.json({ status: "waiting-authorization", code: "DATABASE_NOT_CONFIGURED", error: "DATABASE_URL n'est pas configuré dans Publisher." }, 409);
  }

  let row: ObservatorySourceRow;
  try {
    const sql = await getSql(c.env);
    await ensureObservatorySchema(sql);
    row = await upsertObservatorySource(sql, {
      id: body.id,
      kind: body.kind,
      value: body.value,
      name: body.name,
      category: body.category,
      summary: body.summary,
      confidence: body.confidence,
      tags: body.tags,
      pack: body.pack,
    });
  } catch (error) {
    return c.json({ status: "failed", code: "PERSISTENCE_FAILED", error: error instanceof Error ? error.message : String(error) }, 502);
  }

  // Enrichissement Octopus : best-effort. La source est déjà en base, donc
  // un échec ici est signalé mais ne perd rien.
  const features = Array.isArray(body.features) ? body.features : [];
  const patterns = Array.isArray(body.patterns) ? body.patterns : [];
  const recommendations = Array.isArray(body.recommendations) ? body.recommendations : [];

  try {
    const observation = await observeWithOctopus(octopusEngineUrl(c.env), {
      id: row.id,
      kind: `knowledge-observation:${row.kind}`,
      title: row.name,
      source: "publisher-observatory",
      occurredAt: new Date().toISOString(),
      metrics: {
        confidence: Number(row.average_confidence ?? 0),
        featureCount: features.length,
        patternCount: patterns.length,
        recommendationCount: recommendations.length,
      },
      context: {
        category: row.category,
        language: typeof body.language === "string" ? body.language : null,
      },
      tags: [...new Set([row.kind, ...(row.category ? [row.category] : []), ...(row.tags ?? [])])],
      metadata: {
        summary: row.summary,
        features,
        patterns,
        recommendations,
      },
    });
    const sql = await getSql(c.env);
    const enriched = await attachObservatoryOctopus(sql, row.id, {
      ...observation.publisher,
      receivedAt: new Date().toISOString(),
    });
    return c.json({ status: "ok", source: observatorySourceResponse(enriched ?? row), publisher: observation.publisher });
  } catch (error) {
    return c.json({
      status: "persisted-without-octopus",
      source: observatorySourceResponse(row),
      octopusError: error instanceof Error ? error.message : "Octopus n'a pas pu mémoriser cette observation.",
    });
  }
});

// `status=pending` : ce que le job nocturne doit encore traiter (jamais
// traité, ou ré-observé depuis son dernier passage), en excluant les
// sources que l'utilisateur a décidé d'ignorer.
app.get("/api/observatory/sources", async (c) => {
  if (!(await isDatabaseConfigured(c.env))) return c.json({ configured: false, sources: [] });
  try {
    const sql = await getSql(c.env);
    await ensureObservatorySchema(sql);
    const limitParam = Number.parseInt(c.req.query("limit") ?? "", 10);
    const rows = await listObservatorySources(sql, {
      limit: Number.isFinite(limitParam) ? limitParam : undefined,
      pendingOnly: c.req.query("status") === "pending",
    });
    return c.json({ configured: true, sources: rows.map(observatorySourceResponse) });
  } catch (error) {
    return c.json({ status: "failed", error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

app.post("/api/observatory/sources/:id/decision", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { decision?: string };
  const decision = String(body.decision ?? "") as ObservatoryDecision;
  if (!OBSERVATORY_DECISIONS.includes(decision)) {
    return c.json({ status: "rejected", code: "INVALID_DECISION", error: `Décision inconnue : ${body.decision}.` }, 400);
  }
  if (!(await isDatabaseConfigured(c.env))) {
    return c.json({ status: "waiting-authorization", code: "DATABASE_NOT_CONFIGURED", error: "DATABASE_URL n'est pas configuré dans Publisher." }, 409);
  }
  try {
    const sql = await getSql(c.env);
    await ensureObservatorySchema(sql);
    const row = await setObservatoryDecision(sql, c.req.param("id"), decision);
    if (!row) return c.json({ status: "not-found", error: "Source inconnue." }, 404);
    return c.json({ status: "ok", source: observatorySourceResponse(row) });
  } catch (error) {
    return c.json({ status: "failed", error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

// Appelé par le job nocturne une fois les sources intégrées à un Knowledge
// Pack : elles sortent de la file `status=pending` jusqu'à leur prochaine
// ré-observation.
app.post("/api/observatory/sources/mark-processed", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.map((id) => String(id)) : [];
  if (!(await isDatabaseConfigured(c.env))) {
    return c.json({ status: "waiting-authorization", code: "DATABASE_NOT_CONFIGURED", error: "DATABASE_URL n'est pas configuré dans Publisher." }, 409);
  }
  try {
    const sql = await getSql(c.env);
    await ensureObservatorySchema(sql);
    const processed = await markObservatorySourcesProcessed(sql, ids);
    return c.json({ status: "ok", processed });
  } catch (error) {
    return c.json({ status: "failed", error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

export default {
  fetch: app.fetch,
  async scheduled(_event: unknown, env: Env, ctx: { waitUntil(promise: Promise<unknown>): void }) {
    ctx.waitUntil(runTentacleCycle(env, { limit: 1 }).catch(() => {}));
    // Octopus keeps adapters in an in-memory Map that does not survive isolate
    // recycling, so the registration has to be renewed. Every cron tick is the
    // cheapest place to do it.
    ctx.waitUntil(
      registerWithOctopus({
        octopusUrl: octopusEngineUrl(env),
        publicBaseUrl: publisherPublicUrl(env),
        fetcher: env.OCTOPUS_ENGINE ? env.OCTOPUS_ENGINE.fetch.bind(env.OCTOPUS_ENGINE) as typeof fetch : undefined,
      }).catch(() => {}),
    );
  },
};
