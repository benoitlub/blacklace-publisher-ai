import type { KnowledgePack } from "@/models/knowledge-observatory";
import type { ObservationDecision, ObservationMemoryEntry } from "@/models/observation-memory";
import type { ObservatorySourceRecord } from "@/models/observatory-source";
import { loadObservationMemory, normalizeKey, saveObservationMemory } from "@/memory/observation-memory";
import { listObservatorySources, persistObservatorySource, updateObservatorySourceDecision } from "@/services/observatory-sources";

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

export interface ObservationSyncResult {
  entries: ObservationMemoryEntry[];
  /** Fiches purement locales remontées vers la base pendant cette synchro. */
  pushed: number;
  /** Fiches locales que la base a refusées — réessayées au prochain chargement. */
  failed: number;
}

/**
 * Fiches déjà tentées pendant cette session : une fiche que la base refuse
 * (source vide, payload invalide) ne doit pas être repoussée à chaque
 * remontée de la Mémoire ou de la Serre. Volontairement en mémoire et non
 * dans le localStorage : recharger la page reste le geste naturel pour
 * réessayer.
 */
const attemptedKeys = new Set<string>();

/**
 * Remonte vers la base les fiches qui n'existent que dans ce navigateur —
 * celles observées avant que l'Observatoire n'écrive côté serveur, ou
 * pendant une panne d'API. Sans ça, elles resteraient visibles ici mais
 * invisibles pour tout autre appareil et pour le job nocturne.
 *
 * Le serveur déduplique sur la même clé que `normalizeKey` : remonter deux
 * fois la même source la met à jour au lieu de la dupliquer.
 */
export async function backfillLocalOnlyObservations(
  serverKeys: Set<string>,
  localEntries: ObservationMemoryEntry[],
): Promise<{ records: ObservatorySourceRecord[]; failed: number }> {
  const records: ObservatorySourceRecord[] = [];
  let failed = 0;

  for (const entry of localEntries) {
    const key = normalizeKey(entry.sourceValue);
    if (!key || serverKeys.has(key) || attemptedKeys.has(key)) continue;
    attemptedKeys.add(key);

    try {
      const saved = await persistObservatorySource({
        kind: entry.sourceKind,
        value: entry.sourceValue,
        name: entry.name,
        category: entry.category,
        summary: entry.lastSummary,
        confidence: entry.averageConfidence,
        tags: entry.tags,
        pack: entry.lastPack,
        patterns: entry.lastPack?.patterns,
        recommendations: entry.lastPack?.recommendations,
      });
      // L'upsert ne touche jamais `decision` : une fiche que l'utilisateur
      // avait déjà classée doit garder son classement en arrivant en base.
      records.push(
        entry.currentDecision !== "watch"
          ? await updateObservatorySourceDecision(saved.source.id, entry.currentDecision)
          : saved.source,
      );
    } catch {
      failed += 1;
    }
  }

  return { records, failed };
}

/**
 * Recharge les fiches depuis le serveur, remonte celles qui n'existaient que
 * localement, et met le cache local à jour. Renvoie `null` si l'API est
 * injoignable : l'appelant garde alors ce qu'il a déjà en cache au lieu
 * d'afficher une page vide.
 */
export async function syncObservationMemoryFromServer(): Promise<ObservationSyncResult | null> {
  let records: ObservatorySourceRecord[];
  try {
    records = await listObservatorySources();
  } catch {
    return null;
  }

  const serverKeys = new Set(records.map((record) => normalizeKey(record.value)));
  const localOnly = loadObservationMemory().filter((entry) => !serverKeys.has(normalizeKey(entry.sourceValue)));
  const backfill = await backfillLocalOnlyObservations(serverKeys, localOnly);

  const entries = mergeServerRecords([...records, ...backfill.records]);
  saveObservationMemory(entries);
  return { entries, pushed: backfill.records.length, failed: backfill.failed };
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
