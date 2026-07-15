import { Router } from "express";
import { listGlobalState, readGlobalState } from "../services/global-state";
import { isActiveComposioStatus, isComposioConfigured, listComposioConnectedAccounts } from "../services/composio";

const router = Router();
const COMPOSIO_USER_ID = process.env.COMPOSIO_USER_ID?.trim() || "benoit-lubert";

type ConnectionStatus = "connected" | "authorization-required" | "not-configured" | "unavailable";
type ConnectionRoute = "composio" | "direct-api" | "manual";
type AuthorizationStatus = "granted" | "required" | "not-supported";
type CreditStatus = "available" | "limited" | "exhausted" | "unknown";

interface ProviderObservation {
  id?: string;
  name?: string;
  title?: string;
  description?: string;
  category?: string;
  roles?: string[];
  capabilities?: string[];
  recipe?: string;
  freeTier?: { available?: boolean; credits?: string; checkedAt?: string };
  trial?: { available?: boolean; details?: string; checkedAt?: string };
  access?: { viaComposio?: boolean; directApi?: boolean; manualFallback?: boolean };
  source?: string;
}

interface ConnectionRecord {
  provider?: string;
  status?: ConnectionStatus;
  route?: ConnectionRoute;
  authorization?: AuthorizationStatus;
  creditStatus?: CreditStatus;
  checkedAt?: string;
  notes?: string;
}

interface ProductionStepInput {
  id: string;
  role: string;
  providers?: string[];
}

interface BrokerCandidate {
  id: string;
  name: string;
  role: string;
  route: ConnectionRoute;
  connectionStatus: ConnectionStatus;
  authorization: AuthorizationStatus;
  creditStatus: CreditStatus;
  freeTier: { available?: boolean; credits?: string; checkedAt?: string };
  trial: { available?: boolean; details?: string; checkedAt?: string };
  recipe: string | null;
  reason: string;
  source: string;
  score: number;
  checkedAt: string | null;
  notes: string | null;
}

router.post("/plan", async (req, res) => {
  const seedId = String(req.body?.seedId ?? "").trim();
  const rawStep = req.body?.step as Partial<ProductionStepInput> | undefined;
  if (!seedId || !rawStep?.id || !rawStep?.role) {
    return res.status(400).json({ error: "seedId and step{id, role} are required" });
  }
  const step: ProductionStepInput = {
    id: String(rawStep.id),
    role: String(rawStep.role),
    providers: Array.isArray(rawStep.providers) ? rawStep.providers.map(String) : [],
  };

  try {
    const observationRecords = await listGlobalState<ProviderObservation | ProviderObservation[]>("observations");
    const observations: ProviderObservation[] = [];
    for (const record of observationRecords) {
      if (Array.isArray(record.value)) observations.push(...record.value);
      else observations.push(record.value);
    }

    const [connectionRecords, confirmedConnections] = await Promise.all([
      listGlobalState<ConnectionRecord>("connections"),
      loadServerConfirmedConnections(),
    ]);
    const connections = new Map<string, ConnectionRecord>();
    for (const record of connectionRecords) connections.set(normalize(record.key), record.value);
    for (const [key, record] of confirmedConnections) connections.set(key, record);

    const preferred = step.providers ?? [];
    const candidates = uniqueProviders([
      ...preferred.map((name): ProviderObservation => ({ name, source: "production-plan" })),
      ...observations,
    ])
      .map((provider) => buildCandidate(provider, step.role, connections))
      .filter((candidate) => candidate.score > 0)
      .sort(compareCandidates)
      .slice(0, 8);

    const selected: BrokerCandidate | null = candidates[0] ?? null;
    return res.json({
      version: 1,
      seedId,
      stepId: step.id,
      capability: step.role,
      plannedAt: new Date().toISOString(),
      decisionMode: process.env.MISTRAL_API_KEY ? "mistral-ready-deterministic-safe-mode" : "deterministic-fallback",
      bridge: {
        mistral: process.env.MISTRAL_API_KEY ? "configured" : "not-configured",
        composio: process.env.COMPOSIO_API_KEY ? "configured" : "not-configured",
      },
      selected,
      alternatives: selected ? candidates.slice(1) : candidates,
      executable: Boolean(selected && selected.connectionStatus === "connected" && selected.creditStatus !== "exhausted"),
      requiresHumanAuthorization: Boolean(selected && selected.authorization === "required"),
      note: "A recommendation never implies that an adapter is connected. Execution remains blocked until the connection registry confirms it.",
    });
  } catch (error) {
    return res.status(503).json({ error: error instanceof Error ? error.message : "Connection Broker unavailable" });
  }
});

router.get("/providers/:provider", async (req, res) => {
  try {
    const provider = String(req.params.provider ?? "");
    const key = normalize(provider);
    const record = await readGlobalState<ConnectionRecord>("connections", key);
    const fallback: ConnectionRecord = {
      status: "not-configured",
      authorization: "required",
      creditStatus: "unknown",
    };
    return res.json({
      provider,
      connection: record?.value ?? fallback,
      bridge: {
        mistral: process.env.MISTRAL_API_KEY ? "configured" : "not-configured",
        composio: process.env.COMPOSIO_API_KEY ? "configured" : "not-configured",
      },
    });
  } catch (error) {
    return res.status(503).json({ error: error instanceof Error ? error.message : "Connection status unavailable" });
  }
});

function buildCandidate(provider: ProviderObservation, role: string, connections: Map<string, ConnectionRecord>): BrokerCandidate {
  const name = provider.name ?? provider.title ?? provider.id ?? "Outil observé";
  const key = normalize(provider.id ?? name);
  const connection = connections.get(key);
  const text = normalize([
    name,
    provider.description,
    provider.category,
    ...(provider.roles ?? []),
    ...(provider.capabilities ?? []),
  ].filter(Boolean).join(" "));
  const roleMatch = text.includes(normalize(role));
  const route: ConnectionRoute = connection?.route ?? inferRoute(provider);
  const connectionStatus: ConnectionStatus = connection?.status ?? inferStatus(route, key);
  const authorization: AuthorizationStatus = connection?.authorization ?? (connectionStatus === "connected" ? "granted" : "required");
  const creditStatus: CreditStatus = connection?.creditStatus ?? inferCreditStatus(provider);
  const score = (roleMatch ? 30 : 1)
    + (connectionStatus === "connected" ? 50 : connectionStatus === "authorization-required" ? 15 : 0)
    + (creditStatus === "available" ? 20 : creditStatus === "limited" ? 10 : creditStatus === "exhausted" ? -50 : 0)
    + (provider.freeTier?.available ? 8 : 0)
    + (provider.trial?.available ? 4 : 0);

  return {
    id: key,
    name,
    role,
    route,
    connectionStatus,
    authorization,
    creditStatus,
    freeTier: provider.freeTier ?? { available: false },
    trial: provider.trial ?? { available: false },
    recipe: provider.recipe ?? null,
    reason: provider.description ?? `Candidat pour la capacité ${role}`,
    source: provider.source ?? "publisher-memory",
    score,
    checkedAt: connection?.checkedAt ?? provider.freeTier?.checkedAt ?? provider.trial?.checkedAt ?? null,
    notes: connection?.notes ?? null,
  };
}

async function loadServerConfirmedConnections(): Promise<Map<string, ConnectionRecord>> {
  const confirmed = new Map<string, ConnectionRecord>();
  if (!isComposioConfigured()) return confirmed;
  const accounts = await listComposioConnectedAccounts(COMPOSIO_USER_ID);
  const checkedAt = new Date().toISOString();
  for (const account of accounts) {
    if (!isActiveComposioStatus(account.status)) continue;
    const key = normalize(account.toolkitSlug);
    const record: ConnectionRecord = {
      provider: account.toolkitSlug,
      status: "connected",
      route: "composio",
      authorization: "granted",
      creditStatus: "available",
      checkedAt,
      notes: "Confirmed by Publisher Local technique",
    };
    for (const alias of providerAliases(key)) confirmed.set(alias, record);
  }
  return confirmed;
}

function providerAliases(key: string): string[] {
  const aliases = new Set([key]);
  if (key === "elevenlabs" || key === "eleven-labs") {
    aliases.add("elevenlabs");
    aliases.add("eleven-labs");
    aliases.add("eleven-labs-io");
  }
  if (key === "canva") aliases.add("canva");
  if (key === "metricool") aliases.add("metricool");
  return [...aliases];
}

function inferRoute(provider: ProviderObservation): ConnectionRoute {
  if (provider.access?.viaComposio) return "composio";
  if (provider.access?.directApi) return "direct-api";
  return "manual";
}

function inferStatus(route: ConnectionRoute, key: string): ConnectionStatus {
  if (route === "composio" && process.env.COMPOSIO_API_KEY) return "authorization-required";
  if (route === "direct-api" && providerApiKeyConfigured(key)) return "authorization-required";
  return "not-configured";
}

function providerApiKeyConfigured(key: string): boolean {
  const envName = `${key.replace(/[^a-z0-9]/g, "_").toUpperCase()}_API_KEY`;
  return Boolean(process.env[envName]);
}

function inferCreditStatus(provider: ProviderObservation): CreditStatus {
  if (provider.freeTier?.available) return "available";
  if (provider.trial?.available) return "limited";
  return "unknown";
}

function compareCandidates(a: BrokerCandidate, b: BrokerCandidate): number {
  return b.score - a.score || a.name.localeCompare(b.name);
}

function uniqueProviders(values: ProviderObservation[]): ProviderObservation[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalize(value.id ?? value.name ?? value.title ?? "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalize(value: unknown): string {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default router;
