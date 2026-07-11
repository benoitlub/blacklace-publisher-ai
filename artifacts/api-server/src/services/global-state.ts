import { pool } from "@workspace/db";

export interface GlobalStateRecord<T = unknown> {
  namespace: string;
  key: string;
  value: T;
  version: number;
  updatedAt: string;
}

let schemaReady: Promise<void> | null = null;

async function ensureSchema(): Promise<void> {
  if (!pool) throw new Error("DATABASE_URL is not configured");
  if (!schemaReady) {
    schemaReady = pool.query(`
      CREATE TABLE IF NOT EXISTS publisher_global_state (
        namespace TEXT NOT NULL,
        key TEXT NOT NULL,
        value JSONB NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (namespace, key)
      )
    `).then(() => undefined);
  }
  await schemaReady;
}

export async function readGlobalState<T>(namespace: string, key: string): Promise<GlobalStateRecord<T> | null> {
  await ensureSchema();
  const result = await pool!.query(
    `SELECT namespace, key, value, version, updated_at FROM publisher_global_state WHERE namespace = $1 AND key = $2`,
    [namespace, key],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    namespace: row.namespace,
    key: row.key,
    value: row.value as T,
    version: Number(row.version),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function writeGlobalState<T>(namespace: string, key: string, value: T): Promise<GlobalStateRecord<T>> {
  await ensureSchema();
  const result = await pool!.query(
    `INSERT INTO publisher_global_state (namespace, key, value, version, updated_at)
     VALUES ($1, $2, $3::jsonb, 1, NOW())
     ON CONFLICT (namespace, key)
     DO UPDATE SET value = EXCLUDED.value, version = publisher_global_state.version + 1, updated_at = NOW()
     RETURNING namespace, key, value, version, updated_at`,
    [namespace, key, JSON.stringify(value)],
  );
  const row = result.rows[0];
  return {
    namespace: row.namespace,
    key: row.key,
    value: row.value as T,
    version: Number(row.version),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function listGlobalState<T>(namespace: string): Promise<Array<GlobalStateRecord<T>>> {
  await ensureSchema();
  const result = await pool!.query(
    `SELECT namespace, key, value, version, updated_at FROM publisher_global_state WHERE namespace = $1 ORDER BY updated_at DESC`,
    [namespace],
  );
  return result.rows.map((row) => ({
    namespace: row.namespace,
    key: row.key,
    value: row.value as T,
    version: Number(row.version),
    updatedAt: new Date(row.updated_at).toISOString(),
  }));
}
