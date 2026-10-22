import type { NeonQueryFunction } from "@neondatabase/serverless";
import { blocked, type PublicationStore, type Reservation } from "./metricool-publication";

// Reuse Publisher's existing durable state table. The single brand record and
// version comparison serialize quota reservations across concurrent Workers.
// No process-memory lock, TTL expiry, or new storage service is introduced.
export function metricoolStateStore(sql: NeonQueryFunction<false, false>, brandId: string): PublicationStore {
  return {
    async read() {
      const rows = await sql`SELECT value, version FROM publisher_global_state WHERE namespace = 'metricool-publications' AND key = ${brandId}`;
      if (!rows.length) return { version: 0, reservations: [] };
      const value = rows[0].value as { reservations?: Reservation[] } | null;
      const version = Number(rows[0].version);
      if (!Number.isSafeInteger(version) || version < 1 || !Array.isArray(value?.reservations) || value.reservations.some(r =>
        !r || !r.operationId || !r.fingerprint || !r.copyHash || !r.mediaHash || !r.harvestId || !Array.isArray(r.networks) || !r.networks.length ||
        r.networks.some(n => !["facebook", "instagram", "youtube"].includes(n)) || !/^\d{4}-\d{2}$/.test(r.month) || !r.date || !["pending", "unknown", "scheduled", "published"].includes(r.state))) {
        return blocked("PUBLICATION_STATE_INVALID", "persistence");
      }
      return { version, reservations: value.reservations };
    },
    async compareAndSet(version, reservations) {
      const value = JSON.stringify({ reservations });
      const rows = version === 0
        ? await sql`INSERT INTO publisher_global_state (namespace, key, value, version, updated_at)
            VALUES ('metricool-publications', ${brandId}, ${value}::jsonb, 1, NOW())
            ON CONFLICT (namespace, key) DO NOTHING RETURNING version`
        : await sql`UPDATE publisher_global_state SET value = ${value}::jsonb, version = version + 1, updated_at = NOW()
            WHERE namespace = 'metricool-publications' AND key = ${brandId} AND version = ${version} RETURNING version`;
      return rows.length === 1;
    },
  };
}
