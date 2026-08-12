import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

function createMissingDatabaseProxy(): never {
  return new Proxy({}, {
    get() {
      throw new Error(
        "DATABASE_URL is not set. Database-backed routes are unavailable until the Render database is linked.",
      );
    },
  }) as never;
}

if (!connectionString) {
  console.warn(
    "DATABASE_URL is not set. API will start, but database-backed routes will fail until the database is linked.",
  );
}

export const pool = connectionString
  ? new Pool({ connectionString })
  : null;

const databasePool = pool ?? createMissingDatabaseProxy();

export const db = drizzle(databasePool, { schema });

/**
 * Re-exported so consumers can type a checked-out client without depending on
 * `pg` directly. Deriving it from `typeof pool` does not work: `Pool.connect`
 * is overloaded, and `ReturnType` resolves to the last overload — the
 * callback-style one, which returns `void`.
 */
export type { PoolClient } from "pg";

export * from "./schema";
