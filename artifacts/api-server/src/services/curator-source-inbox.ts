import { curatorClusterKey, type CuratorSignal } from "./autonomous-curator.js";

export interface CuratorInboxRecord {
  readonly signal: CuratorSignal;
  readonly clusterKey: string;
  readonly receivedAt: string;
  readonly expiresAt: string;
  readonly duplicateCount: number;
  readonly sources: readonly string[];
}

export interface CuratorInboxOptions {
  readonly ttlDays: number;
  readonly maximumRecords: number;
}

export const DEFAULT_CURATOR_INBOX_OPTIONS: CuratorInboxOptions = {
  ttlDays: 14,
  maximumRecords: 100,
};

function addDays(value: string, days: number): string {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function isExpired(record: CuratorInboxRecord, now: Date): boolean {
  return new Date(record.expiresAt).getTime() <= now.getTime();
}

export class CuratorSourceInbox {
  readonly #options: CuratorInboxOptions;
  readonly #records = new Map<string, CuratorInboxRecord>();

  constructor(options: CuratorInboxOptions = DEFAULT_CURATOR_INBOX_OPTIONS) {
    this.#options = {
      ttlDays: Math.max(1, options.ttlDays),
      maximumRecords: Math.max(1, options.maximumRecords),
    };
  }

  ingest(signal: CuratorSignal, receivedAt = new Date().toISOString()): CuratorInboxRecord {
    this.prune(new Date(receivedAt));
    const clusterKey = curatorClusterKey(signal);
    const existing = this.#records.get(clusterKey);

    if (existing) {
      const sources = [...new Set([...existing.sources, signal.source])];
      const merged: CuratorInboxRecord = {
        signal: {
          ...existing.signal,
          ...signal,
          claims: [...new Set([...(existing.signal.claims ?? []), ...(signal.claims ?? [])])],
          evidenceRefs: [...new Set([...(existing.signal.evidenceRefs ?? []), ...(signal.evidenceRefs ?? [])])],
          tags: [...new Set([...(existing.signal.tags ?? []), ...(signal.tags ?? [])])],
        },
        clusterKey,
        receivedAt,
        expiresAt: addDays(receivedAt, this.#options.ttlDays),
        duplicateCount: existing.duplicateCount + 1,
        sources,
      };
      this.#records.set(clusterKey, merged);
      return merged;
    }

    const record: CuratorInboxRecord = {
      signal,
      clusterKey,
      receivedAt,
      expiresAt: addDays(receivedAt, this.#options.ttlDays),
      duplicateCount: 0,
      sources: [signal.source],
    };
    this.#records.set(clusterKey, record);
    this.#enforceBound();
    return record;
  }

  list(now = new Date()): CuratorInboxRecord[] {
    this.prune(now);
    return [...this.#records.values()].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  }

  takeBatch(limit: number, now = new Date()): CuratorSignal[] {
    return this.list(now)
      .slice(0, Math.max(0, limit))
      .map((record) => record.signal);
  }

  remove(clusterKey: string): boolean {
    return this.#records.delete(clusterKey);
  }

  prune(now = new Date()): number {
    let removed = 0;
    for (const [key, record] of this.#records) {
      if (!isExpired(record, now)) continue;
      this.#records.delete(key);
      removed += 1;
    }
    return removed;
  }

  #enforceBound(): void {
    if (this.#records.size <= this.#options.maximumRecords) return;
    const oldest = [...this.#records.values()].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
    const excess = this.#records.size - this.#options.maximumRecords;
    for (const record of oldest.slice(0, excess)) this.#records.delete(record.clusterKey);
  }
}
