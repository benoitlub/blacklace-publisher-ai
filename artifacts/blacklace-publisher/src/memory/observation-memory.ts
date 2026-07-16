import type { KnowledgeObservatoryResult } from "@/models/knowledge-observatory";
import type { ObservationDecision, ObservationMemoryEntry, ObservationOctopusEnrichment } from "@/models/observation-memory";

const STORAGE_KEY = "blacklace.publisher.observationMemory.v1";
export const OBSERVATION_MEMORY_CHANGED_EVENT = "blacklace:observation-memory-changed";

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function inferName(result: KnowledgeObservatoryResult): string {
  const source = result.observation.source;
  const raw = source.label || source.value;
  try {
    if (source.kind === "url" || source.kind === "github") {
      const url = new URL(source.value.startsWith("http") ? source.value : `https://${source.value}`);
      return url.hostname.replace(/^www\./, "");
    }
  } catch {
    // Fall back to text label.
  }
  return raw.length > 60 ? `${raw.slice(0, 60)}...` : raw;
}

function findComparables(entries: ObservationMemoryEntry[], tags: string[], currentId?: string): string[] {
  return entries
    .filter((entry) => entry.id !== currentId)
    .filter((entry) => entry.tags.some((tag) => tags.includes(tag)) || tags.includes(entry.category.toLowerCase()))
    .slice(0, 4)
    .map((entry) => entry.name);
}

export function loadObservationMemory(): ObservationMemoryEntry[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveObservationMemory(entries: ObservationMemoryEntry[]): void {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  window.dispatchEvent(new CustomEvent(OBSERVATION_MEMORY_CHANGED_EVENT));
}

export function rememberObservation(result: KnowledgeObservatoryResult): ObservationMemoryEntry {
  const entries = loadObservationMemory();
  const source = result.observation.source;
  const key = normalizeKey(source.value || source.label);
  const now = new Date().toISOString();
  const tags = unique([result.observation.category.toLowerCase(), ...result.pack.tags, ...result.observation.detectedTechnologies.map((tag) => tag.toLowerCase())]);
  const existingIndex = entries.findIndex((entry) => normalizeKey(entry.sourceValue) === key);
  const historyItem = {
    observedAt: now,
    confidence: result.pack.confidence,
    packId: result.pack.id,
    summary: result.pack.summary,
  };

  let saved: ObservationMemoryEntry;

  if (existingIndex >= 0) {
    const existing = entries[existingIndex];
    const history = [...existing.history, historyItem].slice(-12);
    const observationCount = existing.observationCount + 1;
    const averageConfidence = Number((((existing.averageConfidence * existing.observationCount) + result.pack.confidence) / observationCount).toFixed(2));
    saved = {
      ...existing,
      category: result.observation.category,
      lastObservedAt: now,
      observationCount,
      averageConfidence,
      tags: unique([...existing.tags, ...tags]),
      comparableNames: findComparables(entries, tags, existing.id),
      lastSummary: result.pack.summary,
      lastPack: result.pack,
      history,
    };
    entries[existingIndex] = saved;
  } else {
    saved = {
      id: createId("memory"),
      name: inferName(result),
      sourceKind: source.kind,
      sourceValue: source.value,
      category: result.observation.category,
      firstObservedAt: now,
      lastObservedAt: now,
      observationCount: 1,
      averageConfidence: result.pack.confidence,
      tags,
      comparableNames: findComparables(entries, tags),
      currentDecision: "watch",
      lastSummary: result.pack.summary,
      lastPack: result.pack,
      history: [historyItem],
    };
    entries.unshift(saved);
  }

  saveObservationMemory(entries.sort((a, b) => new Date(b.lastObservedAt).getTime() - new Date(a.lastObservedAt).getTime()));
  return saved;
}

export function attachOctopusToLatestObservation(enrichment: Omit<ObservationOctopusEnrichment, "receivedAt">): void {
  const entries = loadObservationMemory();
  if (!entries.length) return;
  const [latest, ...rest] = entries;
  saveObservationMemory([
    {
      ...latest,
      octopus: {
        ...enrichment,
        receivedAt: new Date().toISOString(),
      },
    },
    ...rest,
  ]);
}

export function updateObservationDecision(entryId: string, decision: ObservationDecision): void {
  const entries = loadObservationMemory();
  saveObservationMemory(entries.map((entry) => entry.id === entryId ? { ...entry, currentDecision: decision } : entry));
}

export function clearObservationMemory(): void {
  saveObservationMemory([]);
}
