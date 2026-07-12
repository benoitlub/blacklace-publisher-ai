const DEFAULT_BASE_URL = "https://backend.composio.dev/api/v3";

export interface ComposioConnectedAccount {
  id: string;
  toolkitSlug: string;
  status: string;
  raw: unknown;
}

export interface ComposioConnectionRequest {
  id: string | null;
  redirectUrl: string | null;
  status: string;
  raw: unknown;
}

export function isComposioConfigured(): boolean {
  return Boolean(process.env.COMPOSIO_API_KEY?.trim());
}

export async function listComposioConnectedAccounts(userId: string): Promise<ComposioConnectedAccount[]> {
  const payload = await composioRequest(`/connected_accounts?user_ids=${encodeURIComponent(userId)}&limit=100`);
  return extractItems(payload).map(normalizeConnectedAccount).filter((item): item is ComposioConnectedAccount => Boolean(item));
}

export async function executeComposioTool(input: {
  toolSlug: string;
  arguments: Record<string, unknown>;
  connectedAccountId?: string | null;
}): Promise<unknown> {
  const payload = await composioRequest(`/tools/execute/${encodeURIComponent(input.toolSlug)}`, {
    method: "POST",
    body: JSON.stringify({
      arguments: input.arguments,
      connected_account_id: input.connectedAccountId || undefined,
    }),
  });
  return payload;
}

export async function findComposioAuthConfig(toolkitSlug: string): Promise<string | null> {
  const queries = [
    `/auth_configs?toolkit_slug=${encodeURIComponent(toolkitSlug)}&limit=100`,
    `/auth_configs?toolkit_slugs=${encodeURIComponent(toolkitSlug)}&limit=100`,
  ];

  for (const path of queries) {
    try {
      const payload = await composioRequest(path);
      const config = extractItems(payload).find((item) => {
        const record = asRecord(item);
        const slug = toolkitFrom(record);
        const status = String(record.status ?? record.state ?? "").toUpperCase();
        return (!slug || normalize(slug) === normalize(toolkitSlug)) && !["DISABLED", "DELETED"].includes(status);
      });
      const id = stringValue(asRecord(config).id ?? asRecord(config).auth_config_id);
      if (id) return id;
    } catch (_) {
      // Try the alternate query shape supported by another Composio API revision.
    }
  }

  return null;
}

export async function initiateComposioConnection(input: {
  userId: string;
  authConfigId: string;
  callbackUrl: string;
}): Promise<ComposioConnectionRequest> {
  const payload = await composioRequest("/connected_accounts", {
    method: "POST",
    body: JSON.stringify({
      auth_config: { id: input.authConfigId },
      connection: { user_id: input.userId },
      callback_url: input.callbackUrl,
    }),
  });
  const record = asRecord(payload);
  const nested = asRecord(record.connection ?? record.data);
  return {
    id: stringValue(record.id ?? record.connected_account_id ?? nested.id),
    redirectUrl: stringValue(record.redirect_url ?? record.redirectUrl ?? nested.redirect_url ?? nested.redirectUrl),
    status: String(record.status ?? nested.status ?? "INITIATED"),
    raw: payload,
  };
}

export function isActiveComposioStatus(status: string): boolean {
  return ["ACTIVE", "CONNECTED", "SUCCESS", "ENABLED"].includes(String(status || "").toUpperCase());
}

async function composioRequest(path: string, init: RequestInit = {}): Promise<unknown> {
  const apiKey = process.env.COMPOSIO_API_KEY?.trim();
  if (!apiKey) throw new Error("COMPOSIO_API_KEY is not configured");
  const baseUrl = (process.env.COMPOSIO_API_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, "");
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let payload: unknown = null;
  try { payload = text ? JSON.parse(text) : null; } catch (_) { payload = { message: text }; }
  if (!response.ok) {
    const record = asRecord(payload);
    throw new Error(String(record.message ?? record.error ?? `Composio ${response.status}`));
  }
  return payload;
}

function normalizeConnectedAccount(value: unknown): ComposioConnectedAccount | null {
  const record = asRecord(value);
  const id = stringValue(record.id ?? record.connected_account_id);
  const toolkitSlug = toolkitFrom(record);
  if (!id || !toolkitSlug) return null;
  return {
    id,
    toolkitSlug: normalize(toolkitSlug),
    status: String(record.status ?? record.state ?? "UNKNOWN"),
    raw: value,
  };
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
  for (const key of ["items", "data", "results", "connected_accounts", "auth_configs"]) {
    const value = record[key];
    if (Array.isArray(value)) return value;
    const nested = asRecord(value);
    if (Array.isArray(nested.items)) return nested.items;
  }
  return [];
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function stringValue(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function normalize(value: string): string {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
