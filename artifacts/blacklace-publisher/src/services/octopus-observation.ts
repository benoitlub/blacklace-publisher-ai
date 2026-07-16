const OFFICIAL_API_BASE_URL = "https://blacklace-publisher-api.onrender.com";

function apiUrl(path: string) {
  const base = String(import.meta.env.VITE_API_BASE_URL || OFFICIAL_API_BASE_URL).trim().replace(/\/$/, "");
  return `${base.endsWith("/api") ? base : `${base}/api`}${path}`;
}

export type PublisherOctopusTranslation = {
  relevanceScore: number;
  noveltyScore: number;
  harvestPriority: "observe" | "prepare" | "prioritize";
  editorialSignal: "new" | "emerging" | "established" | "persistent";
  relatedCount: number;
  observedCount: number;
  strongestRelation: number;
  trend: string;
  summary: string;
};

export type PublisherOctopusObservationResult = {
  status: string;
  operationId?: string;
  publisher: PublisherOctopusTranslation;
};

export async function sendObservatoryObservation(input: {
  id: string;
  kind: string;
  title: string;
  summary: string;
  confidence: number;
  category: string;
  language: string;
  features: string[];
  patterns: string[];
  recommendations: string[];
}): Promise<PublisherOctopusObservationResult> {
  const response = await fetch(apiUrl("/octopus-adapter/observe"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: input.id,
      kind: `knowledge-observation:${input.kind}`,
      title: input.title,
      source: "publisher-observatory",
      occurredAt: new Date().toISOString(),
      metrics: {
        confidence: input.confidence,
        featureCount: input.features.length,
        patternCount: input.patterns.length,
        recommendationCount: input.recommendations.length,
      },
      context: {
        category: input.category,
        language: input.language,
      },
      tags: [...new Set([input.kind, input.category, ...input.features.slice(0, 8), ...input.patterns.slice(0, 8)])],
      metadata: {
        summary: input.summary,
        features: input.features,
        patterns: input.patterns,
        recommendations: input.recommendations,
      },
    }),
  });

  const payload = await response.json().catch(() => ({})) as Partial<PublisherOctopusObservationResult> & { summary?: string };
  if (!response.ok || !payload.publisher) {
    throw new Error(payload.summary || `Octopus indisponible (${response.status}).`);
  }
  return payload as PublisherOctopusObservationResult;
}
