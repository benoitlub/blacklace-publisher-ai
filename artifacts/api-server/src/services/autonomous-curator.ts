export type CuratorSignalKind =
  | "tool"
  | "api"
  | "saas"
  | "contest"
  | "client"
  | "research"
  | "learning-source"
  | "platform-risk"
  | "unknown";

export type CuratorDecision =
  | "discarded"
  | "watching"
  | "trend-only"
  | "knowledge-updated"
  | "candidate-prepared";

export interface CuratorSignal {
  readonly id: string;
  readonly title: string;
  readonly source: string;
  readonly capturedAt: string;
  readonly kind?: CuratorSignalKind;
  readonly summary?: string;
  readonly claims?: readonly string[];
  readonly tags?: readonly string[];
  readonly missionIds?: readonly string[];
  readonly evidenceRefs?: readonly string[];
  readonly estimatedMonthlyCost?: number;
  readonly implementationEffort?: number;
  readonly platformRisk?: number;
  readonly lockInRisk?: number;
}

export interface CuratorContext {
  readonly activeMissionIds: readonly string[];
  readonly knownCapabilities: readonly string[];
  readonly unresolvedNeeds: readonly string[];
  readonly now?: Date;
}

export interface CuratorScore {
  readonly missionRelevance: number;
  readonly expectedUtility: number;
  readonly evidenceQuality: number;
  readonly confidence: number;
  readonly economy: number;
  readonly reversibility: number;
  readonly urgency: number;
  readonly duplicationPenalty: number;
  readonly riskPenalty: number;
  readonly total: number;
}

export interface CuratorOutcome {
  readonly signalId: string;
  readonly decision: CuratorDecision;
  readonly reason: string;
  readonly score: CuratorScore;
  readonly clusterKey: string;
  readonly expiresAt?: string;
  readonly recommendation?: {
    readonly title: string;
    readonly summary: string;
    readonly evidenceRefs: readonly string[];
  };
}

export interface CuratorPolicy {
  readonly minimumEvidenceQuality: number;
  readonly minimumMissionRelevance: number;
  readonly promotionThreshold: number;
  readonly watchingThreshold: number;
  readonly rawSignalTtlDays: number;
  readonly maximumCandidatesPerCycle: number;
}

export const DEFAULT_CURATOR_POLICY: CuratorPolicy = {
  minimumEvidenceQuality: 0.55,
  minimumMissionRelevance: 0.5,
  promotionThreshold: 0.68,
  watchingThreshold: 0.45,
  rawSignalTtlDays: 14,
  maximumCandidatesPerCycle: 3,
};

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizedText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function curatorClusterKey(signal: CuratorSignal): string {
  const tags = [...(signal.tags ?? [])].map(normalizedText).filter(Boolean).sort();
  const title = normalizedText(signal.title).split(" ").slice(0, 5).join("-");
  return [signal.kind ?? "unknown", title, ...tags.slice(0, 3)].join(":");
}

function containsKnownCapability(signal: CuratorSignal, context: CuratorContext): boolean {
  const haystack = normalizedText([signal.title, signal.summary ?? "", ...(signal.tags ?? [])].join(" "));
  return context.knownCapabilities.some((capability) => haystack.includes(normalizedText(capability)));
}

function missionRelevance(signal: CuratorSignal, context: CuratorContext): number {
  const explicitMission = (signal.missionIds ?? []).some((id) => context.activeMissionIds.includes(id));
  if (explicitMission) return 1;

  const haystack = normalizedText([signal.title, signal.summary ?? "", ...(signal.tags ?? [])].join(" "));
  const needMatches = context.unresolvedNeeds.filter((need) => haystack.includes(normalizedText(need))).length;
  if (needMatches > 0) return clamp(0.55 + needMatches * 0.15);
  return 0.15;
}

function evidenceQuality(signal: CuratorSignal): number {
  const refs = signal.evidenceRefs?.length ?? 0;
  const claims = signal.claims?.length ?? 0;
  if (refs >= 3) return 1;
  if (refs === 2) return 0.8;
  if (refs === 1) return claims > 2 ? 0.55 : 0.65;
  if (claims > 0) return 0.2;
  return 0.35;
}

function urgency(signal: CuratorSignal): number {
  if (signal.kind === "contest" || signal.kind === "platform-risk") return 0.8;
  return 0.35;
}

function scoreSignal(signal: CuratorSignal, context: CuratorContext): CuratorScore {
  const relevance = missionRelevance(signal, context);
  const evidence = evidenceQuality(signal);
  const duplicate = containsKnownCapability(signal, context) ? 0.7 : 0;
  const cost = signal.estimatedMonthlyCost ?? 0;
  const economy = clamp(1 - cost / 100);
  const effort = clamp(signal.implementationEffort ?? 0.4);
  const reversibility = clamp(1 - ((signal.lockInRisk ?? 0.3) * 0.7 + effort * 0.3));
  const riskPenalty = clamp(((signal.platformRisk ?? 0.2) + (signal.lockInRisk ?? 0.3)) / 2);
  const expectedUtility = clamp(relevance * 0.7 + (signal.kind === "platform-risk" ? 0.25 : 0.15));
  const confidence = clamp(evidence * 0.75 + (signal.evidenceRefs?.length ? 0.2 : 0));
  const urgent = urgency(signal);

  const total = clamp(
    relevance * 0.25
      + expectedUtility * 0.18
      + evidence * 0.2
      + confidence * 0.12
      + economy * 0.08
      + reversibility * 0.07
      + urgent * 0.1
      - duplicate * 0.12
      - riskPenalty * 0.12,
  );

  return {
    missionRelevance: relevance,
    expectedUtility,
    evidenceQuality: evidence,
    confidence,
    economy,
    reversibility,
    urgency: urgent,
    duplicationPenalty: duplicate,
    riskPenalty,
    total,
  };
}

function expiry(capturedAt: string, ttlDays: number): string {
  const date = new Date(capturedAt);
  date.setUTCDate(date.getUTCDate() + ttlDays);
  return date.toISOString();
}

export class AutonomousCurator {
  readonly #policy: CuratorPolicy;

  constructor(policy: CuratorPolicy = DEFAULT_CURATOR_POLICY) {
    this.#policy = policy;
  }

  evaluate(signal: CuratorSignal, context: CuratorContext): CuratorOutcome {
    const score = scoreSignal(signal, context);
    const clusterKey = curatorClusterKey(signal);

    if (score.evidenceQuality < this.#policy.minimumEvidenceQuality) {
      return {
        signalId: signal.id,
        decision: score.total >= this.#policy.watchingThreshold ? "watching" : "discarded",
        reason: "Evidence is too weak for promotion.",
        score,
        clusterKey,
        expiresAt: expiry(signal.capturedAt, this.#policy.rawSignalTtlDays),
      };
    }

    if (score.missionRelevance < this.#policy.minimumMissionRelevance) {
      return {
        signalId: signal.id,
        decision: score.total >= this.#policy.watchingThreshold ? "trend-only" : "discarded",
        reason: "No sufficiently strong link to a current mission or unresolved need.",
        score,
        clusterKey,
        expiresAt: expiry(signal.capturedAt, this.#policy.rawSignalTtlDays),
      };
    }

    if (score.duplicationPenalty > 0.5) {
      return {
        signalId: signal.id,
        decision: "knowledge-updated",
        reason: "Useful evidence, but the capability already exists; enrich the current knowledge instead of adding another tool.",
        score,
        clusterKey,
      };
    }

    if (score.total < this.#policy.promotionThreshold) {
      return {
        signalId: signal.id,
        decision: "watching",
        reason: "Potentially relevant, but the benefit is not certain enough yet.",
        score,
        clusterKey,
        expiresAt: expiry(signal.capturedAt, this.#policy.rawSignalTtlDays),
      };
    }

    return {
      signalId: signal.id,
      decision: "candidate-prepared",
      reason: "High-confidence, mission-relevant value passed the promotion gate.",
      score,
      clusterKey,
      recommendation: {
        title: signal.title,
        summary: signal.summary ?? signal.title,
        evidenceRefs: signal.evidenceRefs ?? [],
      },
    };
  }

  curate(signals: readonly CuratorSignal[], context: CuratorContext): CuratorOutcome[] {
    const bestByCluster = new Map<string, CuratorOutcome>();

    for (const signal of signals) {
      const outcome = this.evaluate(signal, context);
      const existing = bestByCluster.get(outcome.clusterKey);
      if (!existing || outcome.score.total > existing.score.total) bestByCluster.set(outcome.clusterKey, outcome);
    }

    const outcomes = [...bestByCluster.values()].sort((a, b) => b.score.total - a.score.total);
    let promoted = 0;
    return outcomes.map((outcome) => {
      if (outcome.decision !== "candidate-prepared") return outcome;
      promoted += 1;
      if (promoted <= this.#policy.maximumCandidatesPerCycle) return outcome;
      return {
        ...outcome,
        decision: "watching" as const,
        reason: "Candidate limit reached for this cycle; deferred to avoid overload.",
        recommendation: undefined,
      };
    });
  }
}
