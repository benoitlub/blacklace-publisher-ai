import { Hono } from "hono";
import { cors } from "hono/cors";
import { ensureSchema, getSql, isDatabaseConfigured, iterationById, latestIteration, listDueTentacles, recordIteration, setTentacleImage, upsertTentacles, type TentacleMode, type TentacleRow, type TentacleSeedInput } from "./db";
import { resolveKnowledgePackage } from "./knowledge/knowledge-package-resolver";
import { buildImagePrompt, generateImage, imageDataUri } from "./mistral-image";
import { renderVisualSvg } from "./visual";
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
type Env = {
  MISTRAL_API_KEY?: string | SecretsStoreSecret;
  AI_API_KEY?: string | SecretsStoreSecret;
  MISTRAL_MODEL?: string;
  COMPOSIO_API_KEY?: string | SecretsStoreSecret;
  COMPOSIO_USER_ID?: string;
  DATABASE_URL?: string | SecretsStoreSecret;
  GITHUB_TOKEN?: string | SecretsStoreSecret;
  NOTION_API_KEY?: string | SecretsStoreSecret;
  NOTION_DATABASE_ID?: string;
  NOTION_PAGE_ID?: string;
  /** Public origin of this Worker, announced to Octopus as the adapter base. */
  PUBLISHER_PUBLIC_URL?: string;
  OCTOPUS_ENGINE_URL?: string;
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

app.get("/api/health", (c) => c.json({ status: "ok", service: "blacklace-publisher-worker" }));

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

function composioUserId(env: Env): string {
  return env.COMPOSIO_USER_ID?.trim() || "benoit-lubert";
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
  const userId = composioUserId(env);
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
        // never matched anything, so inputSchema was always null here.
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
    body: JSON.stringify({ arguments: input.arguments, connected_account_id: input.connectedAccountId, entity_id: composioUserId(env) }),
  });
}

function toolText(tool: ComposioTool): string {
  return `${tool.slug} ${tool.name} ${tool.description}`.toLowerCase();
}

/**
 * URL du visuel d'une itération — servie par ce Worker, dessinée à la demande.
 *
 * Le visuel passait par Composio, puis devait passer par Canva. Ni l'un ni
 * l'autre ne pouvait composer du texte : le catalogue Canva de Composio
 * n'offrait qu'un outil réclamant un `asset_id` impossible à créer, et la
 * Connect API réserve l'autofill — la seule voie qui pose vraiment du texte —
 * aux comptes Canva Enterprise. Voir `visual.ts` pour le détail.
 *
 * Aucun appel réseau ici : l'URL est déduite de l'identifiant, et le SVG n'est
 * calculé qu'au moment où quelqu'un le regarde. Un visuel ne peut donc plus
 * « échouer » — c'est le texte, et lui seul, qui peut manquer.
 */
/**
 * Nombre d'itérations entre deux fonds d'ambiance.
 *
 * Chaque image est facturée : la régénérer à chaque version coûterait des
 * dizaines d'images par jour pour un gain à peu près nul — une parcelle gagne à
 * garder son atmosphère d'une version à l'autre. Elle est donc refaite aux
 * jalons seulement, plus une fois lors d'un cycle « play », où l'écart est
 * justement l'intérêt.
 */
const IMAGE_REFRESH_EVERY = 10;

function needsNewImage(tentacle: TentacleRow, nextIteration: number, mode: TentacleMode): boolean {
  if (!tentacle.image_file_id) return true;
  if (mode === "play") return true;
  const since = nextIteration - (tentacle.image_iteration ?? 0);
  return since >= IMAGE_REFRESH_EVERY;
}

/**
 * Produit, si le jalon est atteint, un nouveau fond pour la parcelle.
 *
 * N'interrompt jamais le cycle : une image manquante donne une carte
 * typographique, qui reste un livrable. L'échec est journalisé plutôt
 * qu'avalé — c'est le silence, pas l'échec, qui nous a coûté 45 itérations.
 */
async function refreshTentacleImage(
  env: Env,
  sql: Awaited<ReturnType<typeof getSql>>,
  tentacle: TentacleRow,
  nextIteration: number,
  mode: TentacleMode,
): Promise<void> {
  if (!needsNewImage(tentacle, nextIteration, mode)) return;

  try {
    const fileId = await generateImage(env, buildImagePrompt({ title: tentacle.title, objective: tentacle.objective }));
    await setTentacleImage(sql, tentacle.seed_id, fileId, nextIteration);
    console.log(JSON.stringify({ event: "visual.image.generated", seedId: tentacle.seed_id, iteration: nextIteration, fileId }));
  } catch (error) {
    console.log(JSON.stringify({
      event: "visual.image.failed",
      seedId: tentacle.seed_id,
      reason: error instanceof Error ? error.message : String(error),
    }));
  }
}

function visualFor(env: Env, iterationId: string, content: string | null): { url: string | null; toolCombination: string | null } {
  // Pas de texte, pas de visuel : une carte ne portant qu'un titre répété
  // serait un habillage vide, exactement le faux succès qu'on démonte partout
  // ailleurs.
  if (!content?.trim()) return { url: null, toolCombination: null };

  const base = (env.PUBLISHER_PUBLIC_URL || "").replace(/\/$/, "");
  if (!base) return { url: null, toolCombination: null };

  return { url: `${base}/api/visuals/${encodeURIComponent(iterationId)}.svg`, toolCombination: "worker:svg-card" };
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

    // Le visuel ne dépend plus d'aucun tiers : il est dessiné par ce Worker.
    // Il n'a donc ni compte à connecter, ni quota, ni panne possible — d'où un
    // état constant. Reste la seule condition réelle : connaître sa propre URL
    // publique, sans quoi le lien vers le SVG ne peut pas être construit.
    const visual = {
      status: env.PUBLISHER_PUBLIC_URL?.trim() ? "executable" : "unavailable",
      provider: "worker",
      renderer: "svg-card",
      error: env.PUBLISHER_PUBLIC_URL?.trim() ? null : "PUBLISHER_PUBLIC_URL n'est pas configuré.",
    };

    if (!(await isComposioConfigured(env))) {
      return c.json({
        composio: { configured: false, elevenLabsConnected: false, connectedAccounts: [] },
        visual,
        mistral: { status: mistralConfigured ? "executable" : "unavailable", configured: mistralConfigured, available: mistralConfigured },
      });
    }
    const accounts = await listComposioConnectedAccounts(env);
    const elevenLabs = accountFor(accounts, "elevenlabs");
    return c.json({
      // Composio ne sert plus qu'à ElevenLabs, pas encore porté.
      composio: { configured: true, elevenLabsConnected: Boolean(elevenLabs), connectedAccounts: accounts.filter((a) => isActiveComposioStatus(a.status)).map((a) => ({ id: a.id, toolkitSlug: a.toolkitSlug, status: a.status })) },
      visual,
      elevenLabs: { status: elevenLabs ? "connected" : "not-connected", connected: Boolean(elevenLabs), provider: "composio", executable: false },
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
      const title = (body.input?.title as string) || (body.title as string) || "Production Publisher";
      const text = (body.input?.text as string) || (body.input?.content as string) || (body.prompt as string) || "";

      if (!text.trim()) {
        return c.json({ status: "failed", code: "TEXT_REQUIRED", error: "Un texte est requis : une carte sans contenu n'illustre rien." }, 400);
      }

      // Rendu sur place, sans stockage ni appel sortant — l'appelant reçoit le
      // SVG lui-même plutôt qu'un lien vers un service tiers.
      const svg = renderVisualSvg({ title, body: text, parcelId: (body.input?.parcelId as string) || null });
      return c.json({
        status: "completed",
        provider: "worker",
        tool: "svg-card",
        action: "render",
        artifact: {
          id: `visual_${Date.now()}`,
          type: "social-visual",
          kind: "social-visual",
          title: `Visuel principal · ${title}`,
          mimeType: "image/svg+xml",
          content: svg,
        },
      });
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

async function runImproveCycle(env: Env, sql: Awaited<ReturnType<typeof getSql>>, tentacle: TentacleRow): Promise<{ seedId: string; mode: TentacleMode; status: string }> {
  const previous = await latestIteration(sql, tentacle.seed_id);
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
    } catch (_) { /* Mistral unavailable this cycle — a visual alone can still land */ }
  }

  // L'id est décidé ici parce que l'URL du visuel le contient : il faut le
  // connaître avant l'insertion, pas après.
  const iterationId = `iter_${tentacle.seed_id}_${Date.now()}`;
  const visual = visualFor(env, iterationId, content);
  if (visual.url) await refreshTentacleImage(env, sql, tentacle, tentacle.iteration_count + 1, "improve");

  await recordIteration(sql, {
    id: iterationId,
    seedId: tentacle.seed_id,
    mode: "improve",
    content,
    visualUrl: visual.url,
    toolCombination: visual.toolCombination,
  });
  return { seedId: tentacle.seed_id, mode: "improve", status: content || visual.url ? "completed" : "skipped-no-provider" };
}

async function runPlayCycle(env: Env, sql: Awaited<ReturnType<typeof getSql>>, tentacle: TentacleRow): Promise<{ seedId: string; mode: TentacleMode; status: string }> {
  const previous = await latestIteration(sql, tentacle.seed_id);
  const notionApiKey = await resolveSecret(env.NOTION_API_KEY);
  const knowledge = await resolveKnowledgePackage(
    { NOTION_API_KEY: notionApiKey, NOTION_DATABASE_ID: env.NOTION_DATABASE_ID, NOTION_PAGE_ID: env.NOTION_PAGE_ID },
    [tentacle.knowledge_slug, tentacle.parcel_id, tentacle.seed_id],
  );
  // Le texte d'abord, le visuel ensuite : il en est désormais le sujet, alors
  // que l'ordre inverse le condamnait à ne connaître que le titre.
  let content: string | null = null;
  if (knowledge.verified) {
    try {
      const artifact = await executeMistralText(env, { title: tentacle.title, prompt: buildPlayPrompt(tentacle, previous, true, knowledge.prompt), temperature: 0.9 });
      content = artifact.content;
    } catch (_) { /* fine — this cycle just yields whatever it managed */ }
  }

  const iterationId = `iter_${tentacle.seed_id}_${Date.now()}`;
  const visual = visualFor(env, iterationId, content);
  if (visual.url) await refreshTentacleImage(env, sql, tentacle, tentacle.iteration_count + 1, "play");

  await recordIteration(sql, {
    id: iterationId,
    seedId: tentacle.seed_id,
    mode: "play",
    content,
    visualUrl: visual.url,
    toolCombination: visual.toolCombination ?? "mistral:playful-riff",
  });
  return { seedId: tentacle.seed_id, mode: "play", status: content || visual.url ? "completed" : "skipped-no-provider" };
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
 * Aperçu du rendu sans passer par la base — pour juger la mise en page.
 *
 * `?title=...&text=...` : de quoi voir à quoi ressemble une carte avant qu'un
 * cycle n'en produise une.
 */
app.get("/api/visuals/preview.svg", (c) => {
  const svg = renderVisualSvg({
    title: c.req.query("title") || "Rotas — place du marché",
    body: c.req.query("text") || "La fontaine centrale bat au rythme des marées. Personne à Rotas ne se souvient de l'avoir vue tarir, et personne n'ose demander pourquoi.",
    parcelId: c.req.query("parcel") || "blacklace-island",
    iterationNumber: Number(c.req.query("v")) || 1,
  });
  return new Response(svg, { headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "no-store" } });
});

/**
 * Le visuel d'une itération, dessiné à la demande.
 *
 * Rien n'est stocké : le SVG est recalculé depuis le texte déjà en base. Toute
 * amélioration du dessin s'applique donc rétroactivement à l'historique entier,
 * et il n'y a aucun octet à faire expirer.
 *
 * En GET et sans écriture — ouvrable depuis un simple navigateur, y compris un
 * téléphone.
 */
app.get("/api/visuals/:id{.+\\.svg}", async (c) => {
  const id = c.req.param("id").replace(/\.svg$/, "");

  if (!(await isDatabaseConfigured(c.env))) return c.text("DATABASE_URL n'est pas configuré.", 503);

  try {
    const sql = await getSql(c.env);
    await ensureSchema(sql);
    const row = await iterationById(sql, id);
    if (!row) return c.text("Itération introuvable.", 404);

    // Le fond est rechargé à chaque rendu plutôt que stocké en base : garder
    // des méga-octets d'image par itération coûterait bien plus cher que de
    // les redemander, et l'en-tête de cache ci-dessous fait le reste.
    let backgroundDataUri: string | null = null;
    if (row.image_file_id) {
      try {
        backgroundDataUri = await imageDataUri(c.env, row.image_file_id);
      } catch (error) {
        // Une carte typographique reste un livrable : on ne rend pas une
        // erreur là où une image manque.
        console.log(JSON.stringify({ event: "visual.background.failed", id, reason: error instanceof Error ? error.message : String(error) }));
      }
    }

    const svg = renderVisualSvg({
      title: row.title || row.seed_id,
      body: row.content,
      parcelId: row.parcel_id,
      iterationNumber: row.iteration_number,
      backgroundDataUri,
    });

    return new Response(svg, {
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        // Une itération est immuable une fois écrite : son visuel peut être
        // mis en cache longuement sans risque de montrer un état périmé. Le
        // cache porte ici : sans lui, chaque affichage rechargerait l'image de
        // fond auprès de Mistral.
        "cache-control": "public, max-age=86400, immutable",
      },
    });
  } catch (error) {
    return c.text(error instanceof Error ? error.message : String(error), 502);
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
    NOTION_API_KEY: await resolveSecret(env.NOTION_API_KEY),
    NOTION_DATABASE_ID: env.NOTION_DATABASE_ID,
    NOTION_PAGE_ID: env.NOTION_PAGE_ID,
  };
}

/** Health of *this adapter* — distinct from the octopus-witness view above. */
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
      }).catch(() => {}),
    );
  },
};
