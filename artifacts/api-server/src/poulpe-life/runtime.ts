import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { BLACKLACE_PARCEL, BLACKLACE_SEEDS } from "./blacklace-bootstrap";

const TICK_MS = 60_000;
const MAX_GAIN = 4;
let timer: NodeJS.Timeout | null = null;
let ticking = false;
let schemaReady = false;
let bootstrapReady = false;

type QueryClient = {
  query<T = unknown>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
  release(): void;
};

function eventId(seedId: string, at: Date) {
  return `life:${seedId}:${at.toISOString()}`;
}

export async function ensurePoulpeLifeSchema() {
  if (!pool || schemaReady) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`CREATE TABLE IF NOT EXISTS poulpe_parcels (id TEXT PRIMARY KEY, name TEXT NOT NULL, payload JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await client.query(`CREATE TABLE IF NOT EXISTS poulpe_seeds (id TEXT PRIMARY KEY, parcel_id TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'planted', maturity REAL NOT NULL DEFAULT 0, payload JSONB NOT NULL DEFAULT '{}'::jsonb, last_tick_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await client.query(`CREATE TABLE IF NOT EXISTS poulpe_events (id TEXT PRIMARY KEY, parcel_id TEXT, seed_id TEXT, kind TEXT NOT NULL, label TEXT NOT NULL, payload JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await client.query("CREATE INDEX IF NOT EXISTS poulpe_seeds_parcel_idx ON poulpe_seeds (parcel_id)");
    await client.query("CREATE INDEX IF NOT EXISTS poulpe_seeds_status_idx ON poulpe_seeds (status)");
    await client.query("CREATE INDEX IF NOT EXISTS poulpe_events_created_at_idx ON poulpe_events (created_at)");
    await client.query("CREATE INDEX IF NOT EXISTS poulpe_events_seed_idx ON poulpe_events (seed_id)");
    await client.query("COMMIT");
    schemaReady = true;
    logger.info("Persistent Poulpe life schema ready");
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error({ error }, "Persistent Poulpe life schema initialization failed");
    throw error;
  } finally {
    client.release();
  }
}

export async function ensureBlacklaceBootstrap() {
  if (!pool || bootstrapReady) return;
  await ensurePoulpeLifeSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO poulpe_parcels (id, name, payload, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, payload = poulpe_parcels.payload || EXCLUDED.payload, updated_at = NOW()`,
      [BLACKLACE_PARCEL.id, BLACKLACE_PARCEL.name, JSON.stringify(BLACKLACE_PARCEL)],
    );
    for (const seed of BLACKLACE_SEEDS) {
      await client.query(
        `INSERT INTO poulpe_seeds (id, parcel_id, title, status, maturity, payload, last_tick_at, updated_at)
         VALUES ($1, $2, $3, 'planted', 0, $4::jsonb, NULL, NOW())
         ON CONFLICT (id) DO UPDATE SET
           parcel_id = EXCLUDED.parcel_id,
           title = EXCLUDED.title,
           payload = poulpe_seeds.payload || EXCLUDED.payload,
           updated_at = NOW()`,
        [seed.id, seed.parcelId, seed.title, JSON.stringify(seed)],
      );
    }
    await client.query("COMMIT");
    bootstrapReady = true;
    logger.info({ seeds: BLACKLACE_SEEDS.length }, "Blacklace persistent parcel bootstrapped");
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error({ error }, "Blacklace persistent bootstrap failed");
    throw error;
  } finally {
    client.release();
  }
}

export async function tickPoulpeLife() {
  const activePool = pool;
  if (!activePool || ticking) return;
  ticking = true;
  let client: QueryClient | null = null;
  try {
    await ensureBlacklaceBootstrap();
    client = await activePool.connect();
    await client.query("BEGIN");
    const result = await client.query<{
      id: string;
      parcel_id: string;
      title: string;
      status: string;
      maturity: number;
      last_tick_at: Date | null;
      payload: Record<string, unknown>;
    }>(`
      SELECT id, parcel_id, title, status, maturity, last_tick_at, payload
      FROM poulpe_seeds
      WHERE status NOT IN ('harvested', 'composted', 'adventure')
      ORDER BY updated_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 32
    `);

    const now = new Date();
    for (const seed of result.rows) {
      const elapsedMinutes = seed.last_tick_at
        ? Math.max(1, (now.getTime() - new Date(seed.last_tick_at).getTime()) / 60_000)
        : 1;
      const gain = Math.min(MAX_GAIN, Math.max(0.2, elapsedMinutes * 0.35));
      const maturity = Math.min(100, Number(seed.maturity || 0) + gain);
      const status = maturity >= 78 ? "bag-ready" : maturity >= 28 ? "growing" : "observing";
      const payload = {
        ...(seed.payload || {}),
        maturity: Math.round(maturity * 10) / 10,
        status,
        gardener: "gerard",
        lastCultivatedAt: now.toISOString(),
        runtime: "server",
      };

      await client.query(
        `UPDATE poulpe_seeds SET maturity = $2, status = $3, payload = $4::jsonb, last_tick_at = $5, updated_at = $5 WHERE id = $1`,
        [seed.id, payload.maturity, status, JSON.stringify(payload), now],
      );
      await client.query(
        `INSERT INTO poulpe_events (id, parcel_id, seed_id, kind, label, payload, created_at)
         VALUES ($1, $2, $3, 'cultivation', $4, $5::jsonb, $6)
         ON CONFLICT (id) DO NOTHING`,
        [eventId(seed.id, now), seed.parcel_id, seed.id, `Gérard cultive · ${seed.title}`, JSON.stringify({ maturity: payload.maturity, status, runtime: "server" }), now],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => undefined);
    logger.error({ error }, "Persistent Poulpe life tick failed");
  } finally {
    client?.release();
    ticking = false;
  }
}

export function startPoulpeLife() {
  if (!pool || timer) return;
  void ensureBlacklaceBootstrap()
    .then(() => tickPoulpeLife())
    .catch((error) => logger.error({ error }, "Persistent Poulpe life startup failed"));
  timer = setInterval(() => void tickPoulpeLife(), TICK_MS);
  timer.unref?.();
  logger.info({ intervalMs: TICK_MS }, "Persistent Poulpe life started");
}
