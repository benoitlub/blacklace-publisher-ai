import type { KnowledgePack } from "@/models/knowledge-observatory";
import type { ObservationDecision, ObservationMemoryEntry } from "@/models/observation-memory";
import type { ObservatorySourceRecord } from "@/models/observatory-source";
import { loadObservationMemory, normalizeKey, saveObservationMemory } from "@/memory/observation-memory";
import { listObservatorySources, updateObservatorySourceDecision } from "@/services/observatory-sources";

/**
 * Réconciliation entre la table Neon `observatory_sources` (la vérité) et le
 * localStorage (un simple cache de lecture, hérité de l'époque où
 * l'Observatoire n'écrivait nulle part ailleurs).
 *
 * Les fiches renvoyées par le serveur écrasent leur équivalent local ; les
 * fiches purement locales — observées pendant que l'API était injoignable —
 * sont conservées telles quelles plutôt que perdues.
 */

function placeholderPack(record: ObservatorySourceRecord): KnowledgePack {
  return {
    id: `pack-${record.id}`,
    title: record.name,
    summary: record.summary ?? "",
    capabilities: [],
    patterns: [],
    recommendations: [],
    tags: record.tags,
    confidence: record.averageConfidence,
    generatedAt: record.lastObservedAt,
    sourceReferences: [],
    themes: [],
  };
}

export function toMemoryEntry(
  record: ObservatorySourceRecord,
  local?: ObservationMemoryEntry,
): ObservationMemoryEntry {
  const lastPack = record.pack ?? local?.lastPack ?? placeholderPack(record);
  return {
    id: record.id,
    name: record.name,
    sourceKind: record.kind,
    sourceValue: record.value,
    category: record.category ?? local?.category ?? "inconnue",
    firstObservedAt: record.firstObservedAt,
    lastObservedAt: record.lastObservedAt,
    observationCount: record.observationCount,
    averageConfidence: record.averageConfidence,
    tags: record.tags,
    comparableNames: local?.comparableNames ?? [],
    currentDecision: record.decision,
    lastSummary: record.summary ?? local?.lastSummary ?? "",
    lastPack,
    octopus: record.octopus ?? local?.octopus,
    // L'historique détaillé reste une notion locale : le serveur ne conserve
    // que la dernière observation de chaque source.
    history: local?.history ?? [{
      observedAt: record.lastObservedAt,
      confidence: record.averageConfidence,
      packId: lastPack.id,
      summary: record.summary ?? "",
    }],
  };
}

export function mergeServerRecords(
  records: ObservatorySourceRecord[],
  localEntries = loadObservationMemory(),
): ObservationMemoryEntry[] {
  const localByKey = new Map(localEntries.map((entry) => [normalizeKey(entry.sourceValue), entry]));
  const merged: ObservationMemoryEntry[] = [];

  for (const record of records) {
    const key = normalizeKey(record.value);
    merged.push(toMemoryEntry(record, localByKey.get(key)));
    localByKey.delete(key);
  }

  merged.push(...localByKey.values());
  return merged.sort((a, b) => new Date(b.lastObservedAt).getTime() - new Date(a.lastObservedAt).getTime());
}

/**
 * Recharge les fiches depuis le serveur et met le cache local à jour.
 * Renvoie `null` si l'API est injoignable : l'appelant garde alors ce qu'il
 * a déjà en cache au lieu d'afficher une page vide.
 */
export async function syncObservationMemoryFromServer(): Promise<ObservationMemoryEntry[] | null> {
  try {
    const records = await listObservatorySources();
    const entries = mergeServerRecords(records);
    saveObservationMemory(entries);
    return entries;
  } catch {
    return null;
  }
}

/**
 * Écrit la décision côté serveur d'abord — sinon elle ne survivrait ni à un
 * changement d'appareil ni au prochain passage du job nocturne, qui ignore
 * les sources marquées « ignore ».
 */
export async function persistObservationDecision(entryId: string, decision: ObservationDecision): Promise<void> {
  const record = await updateObservatorySourceDecision(entryId, decision);
  const entries = loadObservationMemory();
  saveObservationMemory(entries.map((entry) => (entry.id === record.id ? toMemoryEntry(record, entry) : entry)));
}
