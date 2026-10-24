import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { ToolOperationStore } from "./composio-discovery";
// Reuse the durable Publisher state table; no migration or new service.
export function composioOperationStore(
  sql: NeonQueryFunction<false, false>,
): ToolOperationStore {
  return {
    async read(key) {
      const rows =
        await sql`SELECT value FROM publisher_global_state WHERE namespace='composio-read-operations' AND key=${key}`;
      if (!rows.length) return null;
      const value = rows[0].value;
      if (
        !value ||
        typeof value !== "object" ||
        typeof value.fingerprint !== "string"
      )
        throw new Error("INVALID_OPERATION_STATE");
      return value;
    },
    async claim(key, fingerprint) {
      const value = JSON.stringify({ fingerprint });
      const rows =
        await sql`INSERT INTO publisher_global_state (namespace,key,value,version,updated_at) VALUES ('composio-read-operations',${key},${value}::jsonb,1,NOW()) ON CONFLICT (namespace,key) DO NOTHING RETURNING version`;
      return rows.length === 1;
    },
    async finish(key, fingerprint, result) {
      const value = JSON.stringify({ fingerprint, result });
      const rows =
        await sql`UPDATE publisher_global_state SET value=${value}::jsonb,version=version+1,updated_at=NOW() WHERE namespace='composio-read-operations' AND key=${key} AND value->>'fingerprint'=${fingerprint} RETURNING version`;
      if (rows.length !== 1) throw new Error("OPERATION_STATE_CONFLICT");
    },
  };
}
