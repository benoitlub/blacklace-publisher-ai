import {
  discoverComposioAccounts,
  normalizeToolkit,
  isActiveAccount,
} from "./composio-accounts";
const rec = (v: unknown): Record<string, any> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, any>)
    : {};
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
export class ToolBlocked extends Error {
  constructor(
    public code: string,
    public stage: string,
  ) {
    super(code);
  }
}
export interface ToolOperationStore {
  read(
    key: string,
  ): Promise<{ fingerprint: string; result?: Record<string, unknown> } | null>;
  claim(key: string, fingerprint: string): Promise<boolean>;
  finish(
    key: string,
    fingerprint: string,
    result: Record<string, unknown>,
  ): Promise<void>;
}
export interface DiscoveryDependencies {
  userId: string;
  request(path: string, init?: RequestInit): Promise<unknown>;
  store?: () => Promise<ToolOperationStore>;
}
export interface ToolCandidate {
  slug: string;
  name: string;
  toolkit: string;
  schema: Record<string, any>;
  connected: boolean;
  authMode: string;
  connectionId?: string;
  readPolicy: boolean;
  raw: Record<string, any>;
}
function items(payload: unknown) {
  const p = rec(payload),
    d = rec(p.data);
  const value = Array.isArray(payload)
    ? payload
    : [p.items, p.tools, p.results, p.data, d.items, d.tools].find(
        Array.isArray,
      );
  if (!value) throw new ToolBlocked("INVALID_TOOL_INVENTORY", "discovery");
  return value;
}
async function inventory(deps: DiscoveryDependencies, query: string) {
  const values: any[] = [];
  const seen = new Set<string>();
  let cursor = "";
  for (let page = 0; page < 30; page++) {
    const p = rec(
      await deps.request(
        `/tools?query=${encodeURIComponent(query)}&toolkit_versions=latest&include_deprecated=false&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      ),
    );
    values.push(...items(p));
    const next = str(p.next_cursor ?? rec(p.data).next_cursor);
    if (!next) {
      if (p.has_more === true || rec(p.data).has_more === true)
        throw new ToolBlocked("INCOMPLETE_TOOL_INVENTORY", "discovery");
      return values;
    }
    if (seen.has(next))
      throw new ToolBlocked("TOOL_PAGINATION_LOOP", "discovery");
    seen.add(next);
    cursor = next;
  }
  throw new ToolBlocked("TOOL_PAGE_LIMIT", "discovery");
}
export function discoveryQuery(intent: string) {
  if (
    /prospect|distribut|grossiste|b2b|recherch.*(?:web|source)|business.sources.search/i.test(
      intent,
    )
  )
    return "web search search engine";
  if (/vid[eé]o|animer|animation/i.test(intent))
    return "video generation animation";
  if (/voix|voice|audio/i.test(intent)) return "voice speech audio";
  if (/image|visuel|design/i.test(intent)) return "image generation design";
  if (/programm|publier|publication|social.publish/i.test(intent))
    return "social media scheduling publishing";
  if (/analytics|statistique|performance/i.test(intent))
    return "social media analytics";
  return intent;
}
export async function discoverBusinessTools(
  query: string,
  deps: DiscoveryDependencies,
): Promise<ToolCandidate[]> {
  if (!query.trim() || query.length > 1200)
    throw new ToolBlocked("INVALID_DISCOVERY_INTENT", "validation");
  const accounts = await discoverComposioAccounts(deps.userId, (path) =>
    deps.request(path),
  );
  const tools = await inventory(deps, discoveryQuery(query));
  const found = new Map<string, ToolCandidate>();
  for (const item of tools) {
    let t = rec(item);
    const slug = str(t.slug ?? t.tool_slug);
    if (!slug) continue;
    let schema = rec(
      t.input_parameters ??
        t.input_schema ??
        t.inputSchema ??
        t.parameters ??
        t.schema,
    );
    if (!Object.keys(schema).length) {
      const detail = rec(
        await deps.request(`/tools/${encodeURIComponent(slug)}`),
      );
      const full = rec(detail.data ?? detail);
      if (str(full.slug ?? full.tool_slug) !== slug) continue;
      t = { ...t, ...full };
      schema = rec(
        t.input_parameters ??
          t.input_schema ??
          t.inputSchema ??
          t.parameters ??
          t.schema,
      );
    }
    const toolkit = normalizeToolkit(
      str(
        t.toolkit_slug ??
          t.toolkitSlug ??
          rec(t.toolkit).slug ??
          (typeof t.toolkit === "string" ? t.toolkit : undefined),
      ),
    );
    const active = accounts.filter(
      (a) =>
        normalizeToolkit(a.toolkitSlug) === toolkit &&
        isActiveAccount(a.status),
    );
    const noAuth = t.no_auth === true || t.requires_auth === false;
    const managed = toolkit === "composio-search"; // Existing managed Search transport uses server user_id, not an invented connection ID.
    const authMode =
      active.length > 1
        ? "ambiguous"
        : active.length === 1
          ? "connected-account"
          : noAuth
            ? "no-auth"
            : managed
              ? "managed-platform-auth"
              : "connection-required";
    const name = str(t.name ?? t.display_name) || slug;
    const words = `${slug} ${name} ${str(t.description)}`
      .toLowerCase()
      .replace(/_/g, " ");
    const readPolicy =
      toolkit !== "" &&
      /search/.test(words) &&
      /web|internet|search engine/.test(words) &&
      !/\b(send|publish|schedule|delete|create|update|enrich|purchase|payment|bulk|crawl)\b/.test(
        words,
      ) &&
      t.is_deprecated !== true &&
      rec(t.annotations).destructiveHint !== true;
    found.set(slug, {
      slug,
      name,
      toolkit,
      schema,
      connected: active.length === 1,
      authMode,
      ...(active.length === 1 ? { connectionId: active[0].id } : {}),
      readPolicy,
      raw: t,
    });
  }
  return [...found.values()];
}
const allowedSchema = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "const",
  "default",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "pattern",
  "anyOf",
  "oneOf",
  "allOf",
  "title",
  "description",
  "examples",
  "example",
  "$schema",
  "$id",
  "nullable",
]);
export function validToolArguments(
  value: unknown,
  schema: Record<string, any>,
  depth = 0,
): boolean {
  if (
    depth > 12 ||
    !Object.keys(schema).length ||
    Object.keys(schema).some((k) => !allowedSchema.has(k))
  )
    return false;
  if (
    schema.anyOf &&
    !schema.anyOf.some((s: any) => validToolArguments(value, s, depth + 1))
  )
    return false;
  if (
    schema.oneOf &&
    schema.oneOf.filter((s: any) => validToolArguments(value, s, depth + 1))
      .length !== 1
  )
    return false;
  if (
    schema.allOf &&
    !schema.allOf.every((s: any) => validToolArguments(value, s, depth + 1))
  )
    return false;
  if (
    schema.const !== undefined &&
    JSON.stringify(value) !== JSON.stringify(schema.const)
  )
    return false;
  if (
    schema.enum &&
    !schema.enum.some(
      (v: unknown) => JSON.stringify(v) === JSON.stringify(value),
    )
  )
    return false;
  if (value === null && schema.nullable === true) return true;
  const type = schema.type;
  if (Array.isArray(type))
    return type.some((t) =>
      validToolArguments(value, { ...schema, type: t }, depth + 1),
    );
  if (type === "null") return value === null;
  if (type === "string")
    return (
      typeof value === "string" &&
      value.length >= (schema.minLength ?? 0) &&
      value.length <= (schema.maxLength ?? Infinity) &&
      (!schema.pattern || new RegExp(schema.pattern).test(value))
    );
  if (type === "boolean") return typeof value === "boolean";
  if (type === "integer" || type === "number")
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      (type !== "integer" || Number.isSafeInteger(value)) &&
      value >= (schema.minimum ?? -Infinity) &&
      value <= (schema.maximum ?? Infinity) &&
      (schema.exclusiveMinimum === undefined ||
        value > schema.exclusiveMinimum) &&
      (schema.exclusiveMaximum === undefined || value < schema.exclusiveMaximum)
    );
  if (type === "array")
    return (
      Array.isArray(value) &&
      value.length >= (schema.minItems ?? 0) &&
      value.length <= (schema.maxItems ?? Infinity) &&
      (!schema.items ||
        value.every((v) => validToolArguments(v, schema.items, depth + 1)))
    );
  if (type === "object" || schema.properties) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return false;
    const v = rec(value),
      p = rec(schema.properties);
    return (
      (schema.required ?? []).every((k: string) => Object.hasOwn(v, k)) &&
      Object.entries(v).every(([k, x]) =>
        Object.hasOwn(p, k)
          ? validToolArguments(x, p[k], depth + 1)
          : schema.additionalProperties === true,
      )
    );
  }
  return Boolean(
    schema.anyOf ||
    schema.oneOf ||
    schema.allOf ||
    schema.enum ||
    schema.const !== undefined,
  );
}
function bindQuery(tool: ToolCandidate, query: string) {
  const properties = rec(tool.schema.properties);
  const keys = Object.keys(properties).filter((k) =>
    ["query", "q", "search_query", "search_term"].includes(k),
  );
  if (keys.length !== 1)
    throw new ToolBlocked("AMBIGUOUS_QUERY_SCHEMA", "schema");
  const args: Record<string, unknown> = { [keys[0]]: query };
  for (const key of tool.schema.required ?? [])
    if (!Object.hasOwn(args, key)) {
      if (!Object.hasOwn(rec(properties[key]), "default"))
        throw new ToolBlocked("REQUIRED_ARGUMENT_MISSING", "schema");
      args[key] = properties[key].default;
    }
  if (!validToolArguments(args, tool.schema))
    throw new ToolBlocked("ARGUMENT_SCHEMA_MISMATCH", "schema");
  return args;
}
function unwrap(value: unknown, depth = 0): Record<string, any> {
  if (depth > 8) throw new ToolBlocked("INVALID_PROVIDER_RESPONSE", "provider");
  const p = rec(value);
  if (
    p.successful === false ||
    p.success === false ||
    p.isError === true ||
    p.error ||
    ["error", "failed", "failure"].includes(String(p.status).toLowerCase()) ||
    (Array.isArray(p.errors) && p.errors.length > 0)
  )
    throw new ToolBlocked("PROVIDER_APPLICATION_ERROR", "provider");
  if (Array.isArray(p.citations) || Array.isArray(p.results)) return p;
  if (p.data !== undefined) return unwrap(p.data, depth + 1);
  if (Array.isArray(p.content)) {
    const texts = p.content.filter(
      (c: any) => c.type === "text" && typeof c.text === "string",
    );
    if (texts.length !== 1)
      throw new ToolBlocked("INVALID_PROVIDER_RESPONSE", "provider");
    try {
      return unwrap(JSON.parse(texts[0].text), depth + 1);
    } catch (error) {
      if (error instanceof ToolBlocked) throw error;
    }
  }
  throw new ToolBlocked("INVALID_PROVIDER_RESPONSE", "provider");
}
function publicUrl(value: unknown) {
  try {
    const u = new URL(str(value));
    if (
      !["https:", "http:"].includes(u.protocol) ||
      u.username ||
      u.password ||
      u.port ||
      !u.hostname.includes(".") ||
      /^(localhost|127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.|0\.|\[)/.test(
        u.hostname,
      )
    )
      return null;
    u.hash = "";
    return u.href;
  } catch {
    return null;
  }
}
export function businessCandidates(value: unknown, limit = 10) {
  const data = unwrap(value),
    seen = new Set<string>();
  return (data.citations ?? data.results)
    .flatMap((v: unknown) => {
      const item = rec(v),
        url = publicUrl(item.url ?? item.link ?? item.id),
        title = str(item.title ?? item.name);
      if (!url || !title || seen.has(url)) return [];
      seen.add(url);
      return [
        {
          title: title.slice(0, 500),
          url,
          snippet: str(item.snippet ?? item.description).slice(0, 1500),
          verification: "search-result-only",
        },
      ];
    })
    .slice(0, limit);
}
async function digest(value: string) {
  const b = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(b), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
}
export async function executeBusinessSearch(
  input: {
    query: string;
    operationId: string;
    dryRun: boolean;
    authorized: boolean;
  },
  deps: DiscoveryDependencies,
) {
  const trace: Record<string, unknown>[] = [];
  const base = {
    capability: "business.sources.search",
    verified: false,
    verifiedProspects: 0,
    contacted: false,
    orders: 0,
    published: false,
    trace,
    candidates: [],
  };
  let store: ToolOperationStore | undefined,
    key = "",
    fingerprint = "",
    claimed = false;
  try {
    if (
      !input.query.trim() ||
      input.query.length > 1200 ||
      !input.operationId ||
      input.operationId.length > 250
    )
      throw new ToolBlocked("INVALID_BUSINESS_INTENT", "validation");
    if (!input.dryRun && !input.authorized)
      throw new ToolBlocked(
        "TOOLS_READ_AUTHORIZATION_REQUIRED",
        "authorization",
      );
    const tools = await discoverBusinessTools("web search search engine", deps);
    trace.push({
      stage: "discovery",
      discovered: tools.length,
      connected: tools.filter((t) => t.connected).length,
    });
    const compatible = tools
      .filter((t) => t.readPolicy)
      .sort(
        (a, b) =>
          Number(b.toolkit === "composio-search") -
            Number(a.toolkit === "composio-search") ||
          a.slug.localeCompare(b.slug),
      );
    const plans = compatible
      .map((t) => {
        try {
          return { tool: t, args: bindQuery(t, input.query) };
        } catch {
          return null;
        }
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
    if (!plans.length)
      throw new ToolBlocked(
        tools.length ? "NO_SUPPORTED_READ_SCHEMA" : "NO_TOOLS_DISCOVERED",
        "schema",
      );
    // Only the pre-existing managed search circuit is allowed without a new
    // verified credit policy. Discovery of a paid vendor is not spending consent.
    const plan = plans.find(
      (p) =>
        p.tool.toolkit === "composio-search" &&
        ["managed-platform-auth", "no-auth", "connected-account"].includes(
          p.tool.authMode,
        ),
    );
    if (!plan)
      throw new ToolBlocked(
        plans.some((p) => p.tool.authMode === "ambiguous")
          ? "AMBIGUOUS_CONNECTION"
          : plans.every((p) => p.tool.authMode === "connection-required")
            ? "NO_ACTIVE_CONNECTION"
            : "READ_COST_POLICY_UNVERIFIED",
        "connection",
      );
    const { tool, args } = plan;
    trace.push({
      stage: "selection",
      toolSlug: tool.slug,
      toolkit: tool.toolkit,
      connected: tool.connected,
      authMode: tool.authMode,
      schemaValidated: true,
    });
    const budget = {
      maxCalls: 1,
      automaticRetries: 0,
      creditUsageVerified: false,
      remainingCredits: null,
      policy: "existing-managed-read-only",
    };
    if (input.dryRun)
      return {
        ...base,
        status: "ready-to-read",
        executed: false,
        selectedTool: tool.slug,
        budget,
      };
    if (!deps.store)
      throw new ToolBlocked("OPERATION_STORE_UNAVAILABLE", "persistence");
    store = await deps.store();
    key = await digest(input.operationId);
    fingerprint = await digest(
      JSON.stringify([input.query, tool.slug, args, tool.connectionId ?? null]),
    );
    const prior = await store.read(key);
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        throw new ToolBlocked("OPERATION_CONTENT_CONFLICT", "persistence");
      return prior.result
        ? { ...prior.result, replayed: true }
        : {
            ...base,
            status: "confirmation-required",
            reason: "READ_OUTCOME_UNKNOWN",
            executed: false,
            retryAllowed: false,
          };
    }
    if (!(await store.claim(key, fingerprint)))
      throw new ToolBlocked("OPERATION_ALREADY_CLAIMED", "persistence");
    claimed = true;
    const response = await deps.request(
      `/tools/execute/${encodeURIComponent(tool.slug)}`,
      {
        method: "POST",
        body: JSON.stringify({
          arguments: args,
          user_id: deps.userId,
          entity_id: deps.userId,
          ...(tool.connectionId
            ? { connected_account_id: tool.connectionId }
            : {}),
          version: "latest",
        }),
      },
    );
    const candidates = businessCandidates(response);
    trace.push({
      stage: "result",
      candidateCount: candidates.length,
      verifiedProspects: 0,
    });
    const result = {
      ...base,
      status: candidates.length ? "sources-found" : "no-sources",
      executed: true,
      selectedTool: tool.slug,
      candidates,
      budget,
      sourceCheckedAt: new Date().toISOString(),
    };
    await store.finish(key, fingerprint, result);
    return result;
  } catch (error) {
    const status = Number(rec(error).status);
    const known = error instanceof ToolBlocked;
    const result = {
      ...base,
      status: claimed ? "confirmation-required" : "blocked",
      stage: known ? error.stage : "composio",
      reason: known
        ? error.code
        : status === 429
          ? "COMPOSIO_RATE_LIMITED"
          : [401, 403].includes(status)
            ? "COMPOSIO_AUTHENTICATION_FAILED"
            : "COMPOSIO_UNAVAILABLE",
      executed: false,
      providerCallAttempted: claimed,
      retryAllowed: false,
      ...(status ? { providerHttpStatus: status } : {}),
      ...(status === 429
        ? { retryAfterSeconds: Number(rec(error).retryAfterSeconds) || 60 }
        : {}),
    };
    if (claimed && store) {
      try {
        await store.finish(key, fingerprint, result);
      } catch {
        /* Claim remains pending; never execute twice. */
      }
    }
    return result;
  }
}
