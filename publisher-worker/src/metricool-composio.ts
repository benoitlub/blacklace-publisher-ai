import { isActiveAccount, isMetricoolToolkit, type ConnectedAccount } from "./composio-accounts";
import { blocked, MetricoolBlocked, localDateTime, wallClockInstant, type MetricoolProvider, type ProviderPost } from "./metricool-publication";

export interface MetricoolTool { slug: string; name: string; inputSchema: Record<string, unknown> | null }
const rec = (v: unknown): Record<string, any> => v && typeof v === "object" && !Array.isArray(v) ? v : {};
const str = (v: unknown): string => typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

// Only adapt the documented Metricool MCP operations. A generic action whose
// description mentions "post" is not evidence that it can safely schedule.
function toolFor(tools: MetricoolTool[], name: string): MetricoolTool {
  const matches = tools.filter(t => [t.slug, t.name].some(value => norm(value) === name || norm(value).endsWith("_" + name)));
  if (matches.length !== 1 || !matches[0].inputSchema) blocked("METRICOOL_TOOL_SCHEMA_UNAVAILABLE_" + name.toUpperCase(), "tool-discovery");
  return matches[0];
}
function validate(value: unknown, schema: Record<string, any>): boolean {
  if (schema.$ref || schema.anyOf || schema.oneOf || schema.allOf) return false;
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.type === "integer") return Number.isSafeInteger(value);
  if (schema.type === "number") return typeof value === "number" && Number.isFinite(value);
  if (schema.type === "string") return typeof value === "string";
  if (schema.type === "boolean") return typeof value === "boolean";
  if (schema.type === "array") return Array.isArray(value) && (!schema.items || value.every(v => validate(v, schema.items)));
  if (schema.type === "object" || schema.properties) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const v = rec(value), properties = rec(schema.properties);
    return (schema.required ?? []).every((key: string) => key in v) && Object.entries(v).every(([key, item]) =>
      key in properties ? validate(item, properties[key]) : schema.additionalProperties !== false);
  }
  return !schema.type;
}
export function unwrapComposio(value: unknown): unknown {
  for (let depth = 0; depth < 8; depth++) {
    if (typeof value === "string") {
      try { value = JSON.parse(value); continue; } catch { blocked("METRICOOL_NON_JSON_RESPONSE", "provider-response"); }
    }
    if (Array.isArray(value)) return value;
    const r = rec(value);
    if (!Object.keys(r).length) blocked("METRICOOL_EMPTY_RESPONSE", "provider-response");
    if (r.successful === false || r.success === false || r.isError === true || r.error) blocked("METRICOOL_TOOL_ERROR", "provider-response");
    if (Array.isArray(r.content)) {
      const texts = r.content.filter((v: any) => v?.type === "text" && typeof v.text === "string");
      if (texts.length !== 1) blocked("METRICOOL_MCP_RESPONSE_UNSUPPORTED", "provider-response");
      value = texts[0].text; continue;
    }
    if (("successful" in r || "log_id" in r) && "data" in r) { value = r.data; continue; }
    return r;
  }
  return blocked("METRICOOL_RESPONSE_DEPTH", "provider-response");
}
function responseRows(payload: unknown): { rows: unknown[]; next: string; total?: number } {
  const value = unwrapComposio(payload);
  if (Array.isArray(value)) return { rows: value, next: "" };
  const r = rec(value), data = rec(r.data);
  const rows = [r.data, r.items, r.posts, r.brands, data.items, data.posts].find(Array.isArray);
  if (!rows) blocked("METRICOOL_COLLECTION_INVALID", "provider-response");
  const next = str(r.next_cursor ?? r.nextCursor ?? data.next_cursor ?? data.nextCursor);
  if ((r.has_more === true || data.has_more === true || r.hasNextPage === true) && !next) blocked("METRICOOL_COLLECTION_INCOMPLETE", "provider-response");
  const total = r.total ?? r.total_count ?? r.totalCount ?? data.total;
  if (total !== undefined && (!Number.isSafeInteger(total) || total < 0)) blocked("METRICOOL_TOTAL_INVALID", "provider-response");
  return { rows, next, total };
}
function networksOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(item => typeof item === "string" ? item.toLowerCase() : str(rec(item).network ?? rec(item).name).toLowerCase());
  if (value && typeof value === "object") return Object.entries(rec(value))
    .filter(([key, v]) => !/adsdata$/i.test(key) && (v === true || (typeof v === "string" && !!v.trim()) || rec(v).connected === true || !!str(rec(v).id)))
    .map(([key]) => key.replace(/Data$/, "").toLowerCase());
  return blocked("METRICOOL_NETWORKS_INVALID", "destination");
}
function postOf(value: unknown, network?: string, timezone = "Europe/Madrid", brandId?: string): ProviderPost {
  const r = rec(value);
  const postBrand = str(r.blogId ?? r.blog_id ?? r.brandId);
  if (postBrand && postBrand !== brandId) blocked("METRICOOL_POST_BRAND_MISMATCH", "provider-history");
  const id = str(r.id ?? r.postId ?? r.post_id);
  const text = typeof r.text === "string" ? r.text : typeof r.content === "string" ? r.content : typeof r.caption === "string" ? r.caption : "";
  const media = r.media ?? [];
  const rawDate = str(rec(r.publicationDate).dateTime ?? r.publicationDate ?? r.publishedAt ?? r.dateTime ?? r.date);
  const date = /(?:Z|[+-]\d{2}:\d{2})$/.test(rawDate)
    ? localDateTime(new Date(rawDate), timezone) : rawDate;
  const sourceTimezone = str(rec(r.publicationDate).timezone);
  if (sourceTimezone && sourceTimezone !== timezone) blocked("METRICOOL_POST_TIMEZONE_MISMATCH", "provider-history");
  const networks = network ? [network] : networksOf(r.providers ?? r.networks);
  if (!id || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(date) || !networks.length || networks.some(n => !n) ||
    !Array.isArray(media) || media.some(v => typeof v !== "string")) blocked("METRICOOL_POST_INVALID", "provider-history");
  const rawStatus = str(r.status).toLowerCase();
  const providerStatuses: string[] = Array.isArray(r.providers) ? r.providers.map((p: any) => str(p.status).toLowerCase()) : [];
  const failed = (s: string) => ["failed", "error"].includes(s);
  if ((failed(rawStatus) || providerStatuses.some(failed)) && (!providerStatuses.length || !providerStatuses.every(failed))) blocked("METRICOOL_PARTIAL_PROVIDER_FAILURE", "provider-history");
  let status: ProviderPost["status"];
  if (network) status = "published"; // This is a published-post analytics operation.
  else if (r.draft === true || rawStatus === "draft") status = "draft";
  else if (["error", "failed", "deleted", "cancelled"].includes(rawStatus) ||
    (Array.isArray(r.providers) && r.providers.some((p: any) => ["error", "failed"].includes(str(p.status).toLowerCase())))) status = "failed";
  else if (["published", "sent"].includes(rawStatus)) status = "published";
  else if (["scheduled", "pending", "queued"].includes(rawStatus) ||
    (r.draft === false && r.autoPublish === true && (wallClockInstant(date, timezone) ?? 0) > Date.now())) status = "scheduled";
  else return blocked("METRICOOL_POST_STATUS_UNKNOWN", "provider-history");
  return { id, text, media, networks: [...new Set(networks)], date, status };
}

export async function createMetricoolProvider(deps: {
  accounts: () => Promise<ConnectedAccount[]>;
  tools: (toolkit: string) => Promise<MetricoolTool[]>;
  execute: (input: { toolSlug: string; connectedAccountId: string; arguments: Record<string, unknown> }) => Promise<unknown>;
  connectedAccountId?: string; brandId: string;
}): Promise<MetricoolProvider & { inspectBrand(): Promise<{ id: string; label: string; timezone: string; networks: string[] }> }> {
  const safeRead = async <T>(read: () => Promise<T>): Promise<T> => {
    try { return await read(); } catch (error) {
      if (error instanceof MetricoolBlocked) throw error;
      const status = rec(error).status;
      throw new MetricoolBlocked(status === 429 ? "COMPOSIO_RATE_LIMITED" : status === 401 || status === 403 ? "COMPOSIO_AUTHORIZATION_FAILED" : "COMPOSIO_DISCOVERY_UNAVAILABLE", "connection", status === 429 ? 60 : undefined);
    }
  };
  const accounts = await safeRead(deps.accounts);
  const matches = accounts.filter(a => isMetricoolToolkit(a.toolkitSlug) && isActiveAccount(a.status) && (!deps.connectedAccountId || a.id === deps.connectedAccountId));
  if (matches.length !== 1) blocked(matches.length > 1 ? "METRICOOL_ACCOUNT_AMBIGUOUS" : accounts.some(a => isMetricoolToolkit(a.toolkitSlug)) ? "METRICOOL_ACCOUNT_INACTIVE_OR_WRONG_ID" : "METRICOOL_ACCOUNT_NOT_FOUND_FOR_USER", "connection");
  const account = matches[0];
  const tools = await safeRead(() => deps.tools(account.toolkitSlug));
  const blogId = Number(deps.brandId);
  if (!Number.isSafeInteger(blogId) || blogId <= 0) blocked("METRICOOL_BRAND_INVALID", "destination");
  const call = async (name: string, args: Record<string, unknown>) => {
    const tool = toolFor(tools, name);
    if (!validate(args, tool.inputSchema!)) blocked("METRICOOL_ARGUMENT_SCHEMA_MISMATCH_" + name.toUpperCase(), "tool-discovery");
    try { return unwrapComposio(await deps.execute({ toolSlug: tool.slug, connectedAccountId: account.id, arguments: args })); }
    catch (error) {
      if (error instanceof MetricoolBlocked) throw error;
      const status = rec(error).status;
      throw new MetricoolBlocked(status === 429 ? "COMPOSIO_RATE_LIMITED" : status === 401 || status === 403 ? "COMPOSIO_AUTHORIZATION_FAILED" : "COMPOSIO_UNAVAILABLE", "connection", status === 429 ? 60 : undefined);
    }
  };
  const all = async (name: string, args: Record<string, unknown>) => {
    const rows: unknown[] = [], seen = new Set<string>();
    let cursor = "";
    for (let page = 0; page < 30; page++) {
      const data = responseRows(await call(name, { ...args, ...(cursor ? { cursor } : {}) }));
      rows.push(...data.rows);
      if (!data.next) {
        if (data.total !== undefined && rows.length !== data.total) blocked("METRICOOL_COLLECTION_INCOMPLETE", "provider-history");
        return rows;
      }
      if (seen.has(data.next)) blocked("METRICOOL_PAGINATION_LOOP", "provider-history");
      if (!("cursor" in rec(toolFor(tools, name).inputSchema?.properties))) blocked("METRICOOL_PAGINATION_UNSUPPORTED", "provider-history");
      seen.add(data.next); cursor = data.next;
    }
    return blocked("METRICOOL_PAGE_LIMIT", "provider-history");
  };
  const inspectBrand = async () => {
    const rows = await all("get_brands", {});
    const match = rows.filter(row => str(rec(row).id) === deps.brandId);
    if (match.length !== 1) blocked("METRICOOL_BRAND_NOT_ACCESSIBLE", "destination");
    const r = rec(match[0]);
    const networks = networksOf(r.networks ?? r.networksData);
    return { id: deps.brandId, label: str(r.label), timezone: str(r.timezone), networks: [...new Set(networks)] };
  };
  return {
    inspectBrand,
    async brand() {
      const identity = await inspectBrand();
      const networks = identity.networks;
      if (!networks.length || networks.some(n => !["facebook", "instagram", "youtube"].includes(n))) blocked("METRICOOL_BRAND_QUOTA_COVERAGE_UNSUPPORTED", "verified-budget");
      return identity;
    },
    async published(start, end, networks) {
      // Include reels and stories as well as posts; do not certify a brand-wide
      // allowance from Facebook posts alone. Unknown connected networks block.
      const readers: Record<string, string[]> = {
        facebook: ["get_facebook_posts", "get_facebook_reels", "get_facebook_stories"],
        instagram: ["get_instagram_posts", "get_instagram_reels", "get_instagram_stories"],
        youtube: ["get_youtube_videos"],
      };
      const result: ProviderPost[] = [];
      for (const network of networks) {
        if (!readers[network]) blocked("METRICOOL_BRAND_QUOTA_COVERAGE_UNSUPPORTED", "verified-budget");
        for (const name of readers[network]) {
          const rows = await all(name, { init_date: start, end_date: end, blog_id: blogId });
          result.push(...rows.map(row => postOf(row, network, "Europe/Madrid", deps.brandId)));
        }
      }
      return result;
    },
    async scheduled(start, end, timezone) {
      const rows = await all("get_scheduled_posts", { blog_id: blogId, start, end, timezone: encodeURIComponent(timezone), extendedRange: false });
      return rows.map(row => postOf(row, undefined, timezone, deps.brandId));
    },
    async bestTimes(start, end, network, timezone) {
      const rows = await all("get_best_time_to_post", { start, end, blog_id: blogId, provider: network, timezone: encodeURIComponent(timezone) });
      return rows.map(row => {
        const r = rec(row);
        if (![r.dayOfWeek, r.hour].every(Number.isInteger) || r.dayOfWeek < 1 || r.dayOfWeek > 7 || r.hour < 0 || r.hour > 23 || typeof r.value !== "number" || !Number.isFinite(r.value)) blocked("METRICOOL_BEST_TIMES_INVALID", "best-time");
        return { dayOfWeek: r.dayOfWeek as number, hour: r.hour as number, value: r.value as number };
      });
    },
    async schedule(date, info) {
      const response = rec(await call("post_schedule_post", { date, blog_id: blogId, info }));
      const data = rec(response.data ?? response);
      const id = str(data.id ?? data.postId);
      if (!id) blocked("METRICOOL_WRITE_WITHOUT_POST_ID", "provider-write");
      return id;
    },
  };
}
