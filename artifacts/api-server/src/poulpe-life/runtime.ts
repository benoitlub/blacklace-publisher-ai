import { pool } from "@workspace/db";
import { logger } from "../lib/logger";

const TICK_MS = 60_000;
const MAX_GAIN = 4;
let timer: NodeJS.Timeout | null = null;
let ticking = false;

function eventId(seedId: string, at: Date) {
  return `life:${seedId}:${at.toISOString()}`;
}

export async function tickPoulpeLife() {
  if (!pool || ticking) return;
  ticking = true;
  const client = await pool.connect();
  try {
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
        `UPDATE poulpe_seeds
         SET maturity = $2, status = $3, payload = $4::jsonb, last_tick_at = $5, updated_at = $5
         WHERE id = $1`,
        [seed.id, payload.maturity, status, JSON.stringify(payload), now],
      );

      await client.query(
        `INSERT INTO poulpe_events (id, parcel_id, seed_id, kind, label, payload, created_at)
         VALUES ($1, $2, $3, 'cultivation', $4, $5::jsonb, $6)
         ON CONFLICT (id) DO NOTHING`,
        [
          eventId(seed.id, now),
          seed.parcel_id,
          seed.id,
          `Gérard cultive · ${seed.title}`,
          JSON.stringify({ maturity: payload.maturity, status, runtime: "server" }),
          now,
        ],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error({ error }, "Persistent Poulpe life tick failed");
  } finally {
    client.release();
    ticking = false;
  }
}

export function startPoulpeLife() {
  if (!pool || timer) return;
  void tickPoulpeLife();
  timer = setInterval(() => void tickPoulpeLife(), TICK_MS);
  timer.unref?.();
  logger.info({ intervalMs: TICK_MS }, "Persistent Poulpe life started");
}
