import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

router.get("/poulpe-life/state", async (_req, res) => {
  if (!pool) return res.status(503).json({ error: "database_unavailable" });
  const [parcels, seeds, events] = await Promise.all([
    pool.query("SELECT payload FROM poulpe_parcels ORDER BY updated_at DESC"),
    pool.query("SELECT payload FROM poulpe_seeds ORDER BY updated_at DESC"),
    pool.query("SELECT id, parcel_id, seed_id, kind, label, payload, created_at FROM poulpe_events ORDER BY created_at DESC LIMIT 100"),
  ]);
  return res.json({
    parcels: parcels.rows.map((row) => row.payload),
    seeds: seeds.rows.map((row) => row.payload),
    events: events.rows.map((row) => ({
      id: row.id,
      parcelId: row.parcel_id,
      seedId: row.seed_id,
      kind: row.kind,
      label: row.label,
      ...(row.payload || {}),
      createdAt: row.created_at,
    })),
  });
});

router.post("/poulpe-life/sync", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "database_unavailable" });
  const parcels = Array.isArray(req.body?.parcels) ? req.body.parcels : [];
  const seeds = Array.isArray(req.body?.seeds) ? req.body.seeds : [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const parcel of parcels) {
      if (!parcel?.id) continue;
      await client.query(
        `INSERT INTO poulpe_parcels (id, name, payload, updated_at)
         VALUES ($1, $2, $3::jsonb, NOW())
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, payload = EXCLUDED.payload, updated_at = NOW()`,
        [String(parcel.id), String(parcel.name || parcel.title || parcel.id), JSON.stringify(parcel)],
      );
    }
    for (const seed of seeds) {
      if (!seed?.id || !seed?.parcelId) continue;
      await client.query(
        `INSERT INTO poulpe_seeds (id, parcel_id, title, status, maturity, payload, last_tick_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, NULL, NOW())
         ON CONFLICT (id) DO UPDATE SET
           parcel_id = EXCLUDED.parcel_id,
           title = EXCLUDED.title,
           payload = poulpe_seeds.payload || EXCLUDED.payload,
           updated_at = NOW()`,
        [
          String(seed.id),
          String(seed.parcelId),
          String(seed.title || seed.intent || seed.id),
          String(seed.status || "planted"),
          Number(seed.maturity || 0),
          JSON.stringify(seed),
        ],
      );
    }
    await client.query("COMMIT");
    return res.json({ ok: true, parcels: parcels.length, seeds: seeds.length });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ error: "sync_failed", detail: String(error) });
  } finally {
    client.release();
  }
});

export default router;
