import { Router } from "express";
import { listGlobalState, readGlobalState } from "../services/global-state";

const router = Router();

type ConnectionStatus = "connected" | "authorization-required" | "not-configured" | "unavailable";

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
  route?: "composio" | "direct-api" | "manual";
  authorization?: "granted" | "required" | "not-supported";
  creditStatus?: "available" | "limited" | "exhausted" | "unknown";
  checkedAt?: string;
  notes?: string;
}

router.post("/plan", async (req, res) => {
  const seedId = String(req.body?.seedId || "").trim();
  const step = req.body?.step;
  if (!seedId || !step?.id || !step?.role) {
    return res.status(400).json({ error: "seedId and step{id, role} are required" });
  }

  try {
    const observations = (await listGlobalState<ProviderObservation | ProviderObservation[]>("observations"))
      .flatMap((record) => Array.isArray(record.value) ? record.value : [record.value]);
    const connectionRecords = await listGlobalState<ConnectionRecord>("connections");
    const connections = new Map(connectionRecords.map((record) => [normalize(record.key), record.value]));

    const preferred = Array.isArray(step.providers) ? step.providers.map(String) : [];
    const candidates = uniqueProviders([
      ...preferred.map((name) => ({ name, source: "production-plan" } as ProviderObservation)),
      ...observations,
    ])
      .map((provider) => buildCandidate(provider, String(step.role), connections))
      .filter((candidate) => candidate.score > 0)
      .sort(compareCandidates)
      .slice(0, 8);

    const selected = candidates[0] || null;
    return res.json({
      version: 1,
      seedId,
      stepId: String(step.id),
      capability: String(step.role),
      plannedAt: new Date().toISOString(),
      decisionMode: process.env.MISTRAL_API_KEY ? "mistral-ready-deterministic-safe-mode" : "deterministic-fallback",
      bridge: {
        mistral: process.env.MISTRAL_API_KEY ? "configured" : "not-configured",
        composio: process.env.COMPOSIO_API_KEY ? "configured" : "not-configured",
      },
      selected,
      alternatives: selected ? candidates.slice(1) : candidates,
      executable: selected?.connectionStatus === "connected" && selected?.creditStatus !== "exhausted",
      requiresHumanAuthorization: selected?.authorization === "required",
      note: "A recommendation never implies that an adapter is connected. Execution remains blocked until the connection registry confirms it.",
    });
  } catch (error) {
    return res.status(503).json({ error: error instanceof Error ? error.message : "Connection Broker unavailable" });
  }
});

router.get("/providers/:provider", async (req, res) => {
  try {
    const key = normalize(req.params.provider);
    const record = await readGlobalState<ConnectionRecord>("connections", key);
    return res.json({
      provider: req.params.provider,
      connection: record?.value || { status: "not-configured", authorization: "required", creditStatus: "unknown" },
      bridge: {
        mistral: process.env.MISTRAL_API_KEY ? "configured" : "not-configured",
        composio: process.env.COMPOSIO_API_KEY ? "configured" : "not-configured",
      },
    });
  } catch (error) {
    return res.status(503).json({ error: error instanceof Error ? error.message : "Connection status unavailable" });
  }
});

function buildCandidate(provider: ProviderObservation, role: string, connections: Map<string, ConnectionRecord>) {
  const name = provider.name || provider.title || provider.id || "Outil observé";
  const key = normalize(provider.id || name);
  const connection = connections.get(key);
  const text = normalize([name, provider.description, provider.category, ...(provider.roles || []), ...(provider.capabilities || [])].filter(Boolean).join(" "));
  const roleMatch = text.includes(normalize(role));
  const route = connection?.route || inferRoute(provider);
  const connectionStatus: ConnectionStatus = connection?.status || inferStatus(route, key);
  const authorization = connection?.authorization || (connectionStatus === "connected" ? "granted" : "required");
  const creditStatus = connection?.creditStatus || inferCreditStatus(provider);
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
    freeTier: provider.freeTier || { available: false, checkedAt: null },
    trial: provider.trial || { available: false, checkedAt: null },
    recipe: provider.recipe || null,
    reason: provider.description || `Candidat pour la capacité ${role}`,
    source: provider.source || "publisher-memory",
    score,
    checkedAt: connection?.checkedAt || provider.freeTier?.checkedAt || provider.trial?.checkedAt || null,
    notes: connection?.notes || null,
  };
}

function inferRoute(provider: ProviderObservation): "composio" | "direct-api" | "manual" {
  if (provider.access?.viaComposio) return "composio";
  if (provider.access?.directApi) return "direct-api";
  return "manual";
}

function inferStatus(route: string, key: string): ConnectionStatus {
  if (route === "composio" && process.env.COMPOSIO_API_KEY) return "authorization-required";
  if (route === "direct-api" && providerApiKeyConfigured(key)) return "authorization-required";
  return "not-configured";
}

function providerApiKeyConfigured(key: string): boolean {
  const envName = `${key.replace(/[^a-z0-9]/g, "_").toUpperCase()}_API_KEY`;
  return Boolean(process.env[envName]);
}

function inferCreditStatus(provider: ProviderObservation): "available" | "limited" | "unknown" {
  if (provider.freeTier?.available) return "available";
  if (provider.trial?.available) return "limited";
  return "unknown";
}

function compareCandidates(a: ReturnType<typeof buildCandidate>, b: ReturnType<typeof buildCandidate>) {
  return b.score - a.score || a.name.localeCompare(b.name);
}

function uniqueProviders(values: ProviderObservation[]): ProviderObservation[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalize(value.id || value.name || value.title || "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalize(value: string): string {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default router;
