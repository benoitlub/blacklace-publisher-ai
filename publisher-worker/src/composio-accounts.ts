// Shared account discovery for the existing Composio adapter. Never widen a
// user's query to every connection in the project just because its list is empty.
export interface ConnectedAccount { id: string; toolkitSlug: string; status: string }
const record = (v: unknown): Record<string, any> => v && typeof v === "object" && !Array.isArray(v) ? v : {};
const text = (v: unknown) => typeof v === "string" ? v.trim() : "";
export const normalizeToolkit = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const isMetricoolToolkit = (v: string) => ["metricool", "metricool-mcp", "mcp-metricool"].includes(normalizeToolkit(v));
export const isActiveAccount = (v: string) => ["ACTIVE", "CONNECTED", "SUCCESS", "ENABLED"].includes(v.trim().toUpperCase());

export async function discoverComposioAccounts(
  userId: string,
  request: (path: string) => Promise<unknown>,
): Promise<ConnectedAccount[]> {
  const found = new Map<string, ConnectedAccount>();
  // v3 plural is preferred. Only a schema/route error permits the singular
  // compatibility form; an empty result, 401, 429 or 5xx is not such an error.
  for (const parameter of ["user_ids", "user_id"]) {
    const cursors = new Set<string>();
    let cursor = "";
    try {
      for (let page = 0; page < 30; page++) {
        const payload = record(await request(`/connected_accounts?${parameter}=${encodeURIComponent(userId)}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`));
        const data = record(payload.data);
        const items = [payload.items, payload.connected_accounts, payload.data, data.items, data.connected_accounts].find(Array.isArray);
        if (!items) throw new Error("COMPOSIO_ACCOUNTS_INVALID_RESPONSE");
        for (const value of items) {
          const item = record(value);
          const owner = text(item.user_id ?? item.userId ?? item.entity_id ?? record(item.user).id);
          if (owner && owner !== userId) continue;
          const auth = record(item.auth_config ?? item.authConfig);
          const toolkit = record(item.toolkit ?? auth.toolkit ?? item.app);
          const slug = text(item.toolkit_slug ?? item.toolkitSlug ?? item.app_name ?? item.appName ?? toolkit.slug ?? toolkit.key ?? toolkit.name ?? auth.toolkit_slug);
          const id = text(item.id ?? item.connected_account_id);
          const state = item.status ?? item.state;
          const status = text(typeof state === "string" ? state : record(state).status);
          if (id && slug) found.set(id, { id, toolkitSlug: normalizeToolkit(slug), status });
        }
        const next = text(payload.next_cursor ?? payload.nextCursor ?? data.next_cursor ?? data.nextCursor);
        if (!next) {
          if (payload.has_more === true || data.has_more === true) throw new Error("COMPOSIO_ACCOUNTS_INCOMPLETE");
          return [...found.values()];
        }
        if (cursors.has(next)) throw new Error("COMPOSIO_ACCOUNTS_PAGINATION_LOOP");
        cursors.add(next);
        cursor = next;
      }
      throw new Error("COMPOSIO_ACCOUNTS_PAGE_LIMIT");
    } catch (error) {
      const status = record(error).status;
      if (parameter === "user_ids" && !cursor && [400, 404, 422].includes(status)) continue;
      throw error;
    }
  }
  throw new Error("COMPOSIO_ACCOUNTS_UNAVAILABLE");
}
