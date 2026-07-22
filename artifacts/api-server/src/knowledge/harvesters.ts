export type KnowledgeSourceKind = "notion" | "instagram" | "youtube" | "website" | "document" | "github" | "unknown";

export interface KnowledgeSourceRecord {
  id: string;
  parcelId: string;
  kind: KnowledgeSourceKind;
  title?: string;
  url?: string;
  text?: string;
  summary?: string;
  transcript?: string;
  caption?: string;
  metadata?: Record<string, unknown>;
  publishedAt?: string;
  updatedAt?: string;
}

export interface KnowledgeObservation {
  id: string;
  parcelId: string;
  sourceId: string;
  sourceKind: KnowledgeSourceKind;
  title: string;
  content: string;
  facts: string[];
  sourceUrl: string | null;
  observedAt: string;
  fingerprint: string;
  metadata: Record<string, unknown>;
}

function clean(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function fingerprint(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function splitFacts(content: string): string[] {
  return content
    .split(/(?<=[.!?])\s+|\n+/)
    .map(clean)
    .filter((item) => item.length >= 20)
    .slice(0, 40);
}

function extractContent(source: KnowledgeSourceRecord): string {
  switch (source.kind) {
    case "youtube":
      return clean(source.transcript || source.summary || source.text);
    case "instagram":
      return clean(source.caption || source.summary || source.text);
    case "notion":
    case "document":
    case "website":
    case "github":
      return clean(source.text || source.summary);
    default:
      return clean(source.text || source.summary || source.transcript || source.caption);
  }
}

export function harvestKnowledgeSource(source: KnowledgeSourceRecord): KnowledgeObservation | null {
  if (!source?.id || !source.parcelId) return null;
  const content = extractContent(source);
  if (content.length < 20) return null;
  const signature = fingerprint(`${source.kind}:${source.id}:${content}`);
  return {
    id: `observation:${source.parcelId}:${source.id}:${signature}`,
    parcelId: source.parcelId,
    sourceId: source.id,
    sourceKind: source.kind || "unknown",
    title: clean(source.title) || `${source.kind} · ${source.id}`,
    content,
    facts: splitFacts(content),
    sourceUrl: source.url || null,
    observedAt: new Date().toISOString(),
    fingerprint: signature,
    metadata: {
      ...(source.metadata || {}),
      publishedAt: source.publishedAt || null,
      sourceUpdatedAt: source.updatedAt || null,
      harvester: `${source.kind || "generic"}-harvester`,
    },
  };
}
