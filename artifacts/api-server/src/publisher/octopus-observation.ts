const DEFAULT_OCTOPUS_URL = "https://octopus-engine.onrender.com";

export interface PublisherObservationInput {
  id?: string;
  kind: string;
  title: string;
  source?: string;
  occurredAt?: string;
  metrics?: Record<string, number>;
  context?: Record<string, string | number | boolean | null>;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface UniversalRelation {
  targetId: string;
  relationType: string;
  strength: number;
}

export interface UniversalKnowledge {
  contract?: string;
  observationId?: string;
  recordedAt?: string;
  relations?: UniversalRelation[];
  aggregates?: {
    relatedCount?: number;
    observedCount?: number;
    firstRelatedAt?: string;
    lastRelatedAt?: string;
  };
  trend?: {
    direction?: string;
    window?: string;
  };
}

export interface PublisherKnowledgeTranslation {
  relevanceScore: number;
  noveltyScore: number;
  harvestPriority: "observe" | "prepare" | "prioritize";
  editorialSignal: "new" | "emerging" | "established" | "persistent";
  relatedCount: number;
  observedCount: number;
  strongestRelation: number;
  trend: string;
  summary: string;
}

interface OctopusMissionResponse {
  status?: string;
  summary?: string;
  output?: {
    knowledge?: UniversalKnowledge;
    [key: string]: unknown;
  };
  operationId?: string;
  missionId?: string;
  contextId?: string;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function finite(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function translateUniversalKnowledge(knowledge: UniversalKnowledge | undefined): PublisherKnowledgeTranslation {
  const relations = Array.isArray(knowledge?.relations) ? knowledge.relations : [];
  const relatedCount = finite(knowledge?.aggregates?.relatedCount);
  const observedCount = Math.max(1, finite(knowledge?.aggregates?.observedCount, 1));
  const strongestRelation = relations.reduce((maximum, relation) => Math.max(maximum, finite(relation.strength)), 0);
  const relationDensity = Math.min(1, relatedCount / Math.max(1, observedCount - 1));
  const trend = typeof knowledge?.trend?.direction === "string" ? knowledge.trend.direction : "stable";
  const trendBoost = trend === "increasing" ? 12 : trend === "decreasing" ? -8 : 0;

  const relevanceScore = clampScore(strongestRelation * 55 + relationDensity * 30 + Math.min(15, relatedCount * 3) + trendBoost);
  const noveltyScore = clampScore(100 - strongestRelation * 65 - Math.min(30, relatedCount * 6));

  const editorialSignal: PublisherKnowledgeTranslation["editorialSignal"] = relatedCount === 0
    ? "new"
    : relatedCount < 3
      ? "emerging"
      : trend === "increasing"
        ? "persistent"
        : "established";

  const harvestPriority: PublisherKnowledgeTranslation["harvestPriority"] = relevanceScore >= 72 && relatedCount >= 3
    ? "prioritize"
    : relevanceScore >= 42 || trend === "increasing"
      ? "prepare"
      : "observe";

  const summary = harvestPriority === "prioritize"
    ? `Signal solide : ${relatedCount} relation(s), priorité de récolte élevée.`
    : harvestPriority === "prepare"
      ? `Signal en consolidation : ${relatedCount} relation(s), préparation conseillée.`
      : relatedCount === 0
        ? "Signal nouveau : conserver et observer avant de préparer une récolte."
        : `Signal encore faible : ${relatedCount} relation(s), observation recommandée.`;

  return {
    relevanceScore,
    noveltyScore,
    harvestPriority,
    editorialSignal,
    relatedCount,
    observedCount,
    strongestRelation: Math.round(strongestRelation * 100) / 100,
    trend,
    summary,
  };
}

export async function observeWithOctopus(input: PublisherObservationInput): Promise<{
  status: string;
  operationId?: string;
  knowledge?: UniversalKnowledge;
  publisher: PublisherKnowledgeTranslation;
  octopus: OctopusMissionResponse;
}> {
  const octopusUrl = (process.env.OCTOPUS_ENGINE_URL?.trim() || DEFAULT_OCTOPUS_URL).replace(/\/$/, "");
  const observationId = input.id?.trim() || `publisher-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const operationId = `publisher-observation-${observationId}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(`${octopusUrl}/mission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        operationId,
        title: `Receive Publisher observation: ${input.title}`,
        objective: "Record, compare and relate a neutral observation without assigning a business meaning.",
        requiredCapabilities: ["observation.receive"],
        authorizedResources: [],
        context: {
          id: `publisher:${observationId}`,
          label: input.title,
          objective: "Preserve a neutral Publisher observation for universal history and comparison.",
          metadata: {
            source: input.source?.trim() || "publisher",
            observation: {
              id: observationId,
              kind: input.kind,
              title: input.title,
              occurredAt: input.occurredAt || new Date().toISOString(),
              metrics: input.metrics || {},
              context: input.context || {},
              tags: Array.isArray(input.tags) ? input.tags : [],
              metadata: input.metadata || {},
            },
          },
        },
      }),
    });

    const payload = await response.json().catch(() => ({})) as OctopusMissionResponse;
    if (!response.ok) {
      throw new Error(payload.summary || `Octopus returned HTTP ${response.status}.`);
    }

    const knowledge = payload.output?.knowledge;
    return {
      status: payload.status || "completed",
      operationId: payload.operationId || operationId,
      knowledge,
      publisher: translateUniversalKnowledge(knowledge),
      octopus: payload,
    };
  } finally {
    clearTimeout(timeout);
  }
}
