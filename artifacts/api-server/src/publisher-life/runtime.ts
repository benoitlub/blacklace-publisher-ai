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

export interface PublisherLifeStatus {
  running: boolean;
  intervalMs: number;
  lastTickAt: string | null;
  lastSuccessAt: string | null;
  candidatesSeen: number;
  packsWritten: number;
  rejected: number;
  errors: string[];
}

function intervalMs(): number {
  const configured = Number(process.env.PUBLISHER_LIFE_INTERVAL_MS || DEFAULT_TICK_MS);
  return Number.isFinite(configured) && configured >= 60_000 ? configured : DEFAULT_TICK_MS;
}

function candidateKey(candidate: McpQualificationCandidate): string {
  return candidate.id || candidate.descriptor.id;
}

function packKey(pack: McpToolPack): string {
  return pack.id.replace(/^mcp-tool-pack:/, "");
}

function due(candidate: McpQualificationCandidate, updatedAt?: string): boolean {
  if (!updatedAt) return true;
  const minutes = Math.max(1, candidate.refreshAfterMinutes ?? 24 * 60);
  const age = Date.now() - new Date(updatedAt).getTime();
  return !Number.isFinite(age) || age >= minutes * 60_000;
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
    packsWritten: 0,
    rejected: 0,
    errors: [],
  };

  try {
    const records = await listGlobalState<McpQualificationCandidate>("mcp-candidates");
    const candidates = records
      .filter((record) => record.value?.enabled !== false)
      .slice(0, MAX_CANDIDATES_PER_TICK);

    for (const record of candidates) {
      const candidate = record.value;
      status.candidatesSeen += 1;
      const previous = await readGlobalState<McpToolPack>("mcp-tool-packs", candidateKey(candidate));
      if (!due(candidate, previous?.updatedAt)) continue;

      for (const request of candidate.requests ?? []) {
        try {
          const pack = qualifyMcpServer(candidate.descriptor, request);
          await writeGlobalState("mcp-tool-packs", packKey(pack), {
            ...pack,
            autonomy: {
              qualifiedBy: "publisher-life",
              candidateId: candidateKey(candidate),
              source: candidate.source ?? candidate.descriptor.source ?? "publisher-memory",
              checkedAt: new Date().toISOString(),
            },
          });
          await writeGlobalState("publisher-activity", `mcp:${packKey(pack)}:${Date.now()}`, {
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
          status.errors.push(`${candidateKey(candidate)}:${request.capability}:${error instanceof Error ? error.message : String(error)}`);
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
