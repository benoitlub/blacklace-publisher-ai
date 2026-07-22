import { logger } from "../lib/logger";
import { listGlobalState, readGlobalState, writeGlobalState } from "../services/global-state";
import {
  qualifyMcpServer,
  type CapabilityRequest,
  type McpServerDescriptor,
  type McpToolPack,
} from "../services/mcp-lab";

const DEFAULT_TICK_MS = 5 * 60_000;
const MAX_CANDIDATES_PER_TICK = 12;
let timer: NodeJS.Timeout | null = null;
let ticking = false;

export interface McpQualificationCandidate {
  id: string;
  descriptor: McpServerDescriptor;
  requests: CapabilityRequest[];
  enabled?: boolean;
  refreshAfterMinutes?: number;
  discoveredAt?: string;
  source?: string;
}

interface McpObservation {
  id?: string;
  source?: string;
  mcp?: McpServerDescriptor;
  descriptor?: McpServerDescriptor;
  capabilityRequests?: CapabilityRequest[];
  requests?: CapabilityRequest[];
  refreshAfterMinutes?: number;
  enabled?: boolean;
}

export interface PublisherLifeStatus {
  running: boolean;
  intervalMs: number;
  lastTickAt: string | null;
  lastSuccessAt: string | null;
  candidatesSeen: number;
  candidatesDiscovered: number;
  packsWritten: number;
  rejected: number;
  errors: string[];
}

function intervalMs(): number {
  const configured = Number(process.env.PUBLISHER_LIFE_INTERVAL_MS || DEFAULT_TICK_MS);
  return Number.isFinite(configured) && configured >= 60_000 ? configured : DEFAULT_TICK_MS;
}

function packKeyFor(descriptor: McpServerDescriptor, request: CapabilityRequest): string {
  return `${normalize(descriptor.id)}:${normalize(request.capability)}`;
}

function due(candidate: McpQualificationCandidate, updatedAt?: string): boolean {
  if (!updatedAt) return true;
  const minutes = Math.max(1, candidate.refreshAfterMinutes ?? 24 * 60);
  const age = Date.now() - new Date(updatedAt).getTime();
  return !Number.isFinite(age) || age >= minutes * 60_000;
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function discoverCandidatesFromObservatory(): Promise<number> {
  const records = await listGlobalState<McpObservation | McpObservation[]>("observations");
  let discovered = 0;
  for (const record of records) {
    const observations = Array.isArray(record.value) ? record.value : [record.value];
    for (const observation of observations) {
      const descriptor = observation?.mcp ?? observation?.descriptor;
      const requests = observation?.capabilityRequests ?? observation?.requests;
      if (!descriptor?.id || !Array.isArray(descriptor.tools) || !Array.isArray(requests) || requests.length === 0) continue;
      const id = observation.id || `observed:${descriptor.id}`;
      const existing = await readGlobalState<McpQualificationCandidate>("mcp-candidates", id);
      if (existing && JSON.stringify(existing.value.descriptor) === JSON.stringify(descriptor) && JSON.stringify(existing.value.requests) === JSON.stringify(requests)) continue;
      await writeGlobalState<McpQualificationCandidate>("mcp-candidates", id, {
        id,
        descriptor,
        requests,
        enabled: observation.enabled !== false,
        refreshAfterMinutes: observation.refreshAfterMinutes,
        discoveredAt: new Date().toISOString(),
        source: observation.source ?? record.key,
      });
      discovered += 1;
    }
  }
  return discovered;
}

export async function tickPublisherLife(): Promise<PublisherLifeStatus> {
  if (ticking) {
    const existing = await readGlobalState<PublisherLifeStatus>("publisher-life", "status").catch(() => null);
    return existing?.value ?? {
      running: true,
      intervalMs: intervalMs(),
      lastTickAt: null,
      lastSuccessAt: null,
      candidatesSeen: 0,
      candidatesDiscovered: 0,
      packsWritten: 0,
      rejected: 0,
      errors: ["tick-already-running"],
    };
  }

  ticking = true;
  const status: PublisherLifeStatus = {
    running: true,
    intervalMs: intervalMs(),
    lastTickAt: new Date().toISOString(),
    lastSuccessAt: null,
    candidatesSeen: 0,
    candidatesDiscovered: 0,
    packsWritten: 0,
    rejected: 0,
    errors: [],
  };

  try {
    status.candidatesDiscovered = await discoverCandidatesFromObservatory();
    const records = await listGlobalState<McpQualificationCandidate>("mcp-candidates");
    const candidates = records
      .filter((record) => record.value?.enabled !== false)
      .slice(0, MAX_CANDIDATES_PER_TICK);

    for (const record of candidates) {
      const candidate = record.value;
      status.candidatesSeen += 1;

      for (const request of candidate.requests ?? []) {
        const storageKey = packKeyFor(candidate.descriptor, request);
        const previous = await readGlobalState<McpToolPack>("mcp-tool-packs", storageKey);
        if (!due(candidate, previous?.updatedAt)) continue;
        try {
          const pack = qualifyMcpServer(candidate.descriptor, request);
          await writeGlobalState("mcp-tool-packs", storageKey, {
            ...pack,
            autonomy: {
              qualifiedBy: "publisher-life",
              candidateId: candidate.id,
              source: candidate.source ?? candidate.descriptor.source ?? "publisher-memory",
              checkedAt: new Date().toISOString(),
            },
          });
          await writeGlobalState("publisher-activity", `mcp:${storageKey}:${Date.now()}`, {
            kind: "mcp-qualified",
            label: pack.status === "verified"
              ? `Publisher a appris ${pack.capability}`
              : `Publisher doit revoir ${pack.capability}`,
            capability: pack.capability,
            server: pack.server,
            status: pack.status,
            gerardMayRequestCapability: pack.policy.gerardMayRequestCapability,
            octopusMayExecute: pack.policy.octopusMayExecute,
            generatedAt: pack.generatedAt,
          });
          status.packsWritten += 1;
          if (pack.status === "rejected") status.rejected += 1;
        } catch (error) {
          status.errors.push(`${candidate.id}:${request.capability}:${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    status.lastSuccessAt = new Date().toISOString();
    await writeGlobalState("publisher-life", "status", status);
    logger.info(status, "Publisher autonomous MCP qualification tick completed");
    return status;
  } catch (error) {
    status.errors.push(error instanceof Error ? error.message : String(error));
    await writeGlobalState("publisher-life", "status", status).catch(() => undefined);
    logger.error({ error }, "Publisher autonomous MCP qualification tick failed");
    return status;
  } finally {
    ticking = false;
  }
}

export function startPublisherLife(): void {
  if (timer || process.env.PUBLISHER_LIFE_ENABLED === "false") return;
  const ms = intervalMs();
  void tickPublisherLife();
  timer = setInterval(() => void tickPublisherLife(), ms);
  timer.unref?.();
  logger.info({ intervalMs: ms }, "Publisher autonomous life started");
}
