import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { SecretsStoreSecret } from "./worker";

// Neon's HTTP driver works over fetch, which is the only thing a Cloudflare
// Worker can actually use to reach Postgres (no raw TCP sockets available in
// the Workers runtime) — this is why Neon specifically, not any Postgres.

export type TentacleMode = "improve" | "play";

export interface TentacleRow {
  seed_id: string;
  parcel_id: string;
  title: string;
  objective: string | null;
  first_harvest: string | null;
  knowledge_slug: string | null;
  mode: TentacleMode;
  iteration_count: number;
  last_run_at: string | null;
  cooldown_until: string | null;
  tools_tried: string[];
  updated_at: string;
}

export interface IterationRow {
  id: string;
  seed_id: string;
  iteration_number: number;
  mode: TentacleMode;
  content: string | null;
  visual_url: string | null;
  tool_combination: string | null;
  created_at: string;
}

let cachedSql: NeonQueryFunction<false, false> | null = null;
let cachedForUrl = "";

async function resolveDatabaseUrl(value: string | SecretsStoreSecret | undefined): Promise<string> {
  if (typeof value === "string") return value.trim();
  if (value && typeof (value as SecretsStoreSecret).get === "function") {
    try {
      const resolved = await (value as SecretsStoreSecret).get();
      return typeof resolved === "string" ? resolved.trim() : "";
    } catch (_) {
      return "";
    }
  }
  return "";
}

export async function getSql(env: { DATABASE_URL?: string | SecretsStoreSecret }): Promise<NeonQueryFunction<false, false>> {
  const url = await resolveDatabaseUrl(env.DATABASE_URL);
  if (!url) throw new Error("DATABASE_URL n'est pas configuré dans Publisher.");
  if (cachedSql && cachedForUrl === url) return cachedSql;
  cachedSql = neon(url);
  cachedForUrl = url;
  return cachedSql;
}

export async function isDatabaseConfigured(env: { DATABASE_URL?: string | SecretsStoreSecret }): Promise<boolean> {
  return Boolean(await resolveDatabaseUrl(env.DATABASE_URL));
}

let schemaEnsured = false;

export async function ensureSchema(sql: NeonQueryFunction<false, false>): Promise<void> {
  if (schemaEnsured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS tentacles (
      seed_id TEXT PRIMARY KEY,
      parcel_id TEXT NOT NULL,
      title TEXT NOT NULL,
      objective TEXT,
      first_harvest TEXT,
      knowledge_slug TEXT,
      mode TEXT NOT NULL DEFAULT 'improve',
      iteration_count INTEGER NOT NULL DEFAULT 0,
      last_run_at TIMESTAMPTZ,
      cooldown_until TIMESTAMPTZ,
      tools_tried TEXT[] NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS tentacle_iterations (
      id TEXT PRIMARY KEY,
      seed_id TEXT NOT NULL REFERENCES tentacles(seed_id) ON DELETE CASCADE,
      iteration_number INTEGER NOT NULL,
      mode TEXT NOT NULL,
      content TEXT,
      visual_url TEXT,
      tool_combination TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS tentacle_iterations_seed_id_idx ON tentacle_iterations (seed_id, created_at DESC)`;
  schemaEnsured = true;
}

export interface TentacleSeedInput {
  seedId: string;
  parcelId: string;
  title: string;
  objective?: string;
  firstHarvest?: string;
  knowledgeSlug?: string;
}

// Upsert only touches catalog fields (title/objective/...) — never resets
// mode, iteration_count or cooldown, so a re-sync from the browser never
// interrupts a tentacle already mid-cycle server-side.
export async function upsertTentacles(sql: NeonQueryFunction<false, false>, seeds: TentacleSeedInput[]): Promise<number> {
  let count = 0;
  for (const seed of seeds) {
    if (!seed.seedId || !seed.parcelId || !seed.title) continue;
    await sql`
      INSERT INTO tentacles (seed_id, parcel_id, title, objective, first_harvest, knowledge_slug)
      VALUES (${seed.seedId}, ${seed.parcelId}, ${seed.title}, ${seed.objective ?? null}, ${seed.firstHarvest ?? null}, ${seed.knowledgeSlug ?? null})
      ON CONFLICT (seed_id) DO UPDATE SET
        parcel_id = EXCLUDED.parcel_id,
        title = EXCLUDED.title,
        objective = EXCLUDED.objective,
        first_harvest = EXCLUDED.first_harvest,
        knowledge_slug = EXCLUDED.knowledge_slug,
        updated_at = now()
    `;
    count += 1;
  }
  return count;
}

export async function listDueTentacles(sql: NeonQueryFunction<false, false>, limit = 5): Promise<TentacleRow[]> {
  const rows = await sql`
    SELECT t.*
    FROM tentacles t
    LEFT JOIN LATERAL (
      SELECT i.content, i.visual_url
      FROM tentacle_iterations i
      WHERE i.seed_id = t.seed_id
      ORDER BY i.created_at DESC
      LIMIT 1
    ) latest ON true
    WHERE (t.cooldown_until IS NULL OR t.cooldown_until <= now())
       OR (latest.content IS NULL AND latest.visual_url IS NULL)
    ORDER BY t.last_run_at ASC NULLS FIRST
    LIMIT ${limit}
  `;
  return rows as unknown as TentacleRow[];
}

export async function latestIteration(sql: NeonQueryFunction<false, false>, seedId: string): Promise<IterationRow | null> {
  const rows = await sql`
    SELECT * FROM tentacle_iterations WHERE seed_id = ${seedId} ORDER BY created_at DESC LIMIT 1
  `;
  return (rows[0] as unknown as IterationRow) ?? null;
}

const BASE_COOLDOWN_MS = 20 * 60 * 1000;
const MAX_COOLDOWN_MS = 6 * 60 * 60 * 1000;

// Same doubling backoff as gerard-autonomy.js's client-side loop (20min,
// doubling per iteration, capped at 6h) — ported here so the server-side
// cadence feels like the same gardener, not a separate, uncoordinated one.
export function cooldownMs(iterationCount: number): number {
  const doublings = Math.min(Math.max(iterationCount, 0), 5);
  return Math.min(BASE_COOLDOWN_MS * Math.pow(2, doublings), MAX_COOLDOWN_MS);
}

/**
 * `id` est accepté en entrée — et non plus seulement fabriqué ici — parce que
 * l'URL du visuel contient cet identifiant. L'appelant doit donc le connaître
 * *avant* l'insertion, sinon il faudrait réécrire la ligne juste après l'avoir
 * créée. Omis, le schéma d'origine s'applique.
 *
 * Le numéro d'itération et l'id sont rendus : le visuel les affiche.
 */
export async function recordIteration(sql: NeonQueryFunction<false, false>, input: {
  seedId: string; mode: TentacleMode; content: string | null; visualUrl: string | null; toolCombination: string | null; id?: string;
}): Promise<{ id: string; iterationNumber: number }> {
  const [current] = await sql`SELECT iteration_count, tools_tried FROM tentacles WHERE seed_id = ${input.seedId}`;
  const row = current as unknown as { iteration_count: number; tools_tried: string[] } | undefined;
  const nextIteration = (row?.iteration_count ?? 0) + 1;
  const id = input.id ?? `iter_${input.seedId}_${Date.now()}`;
  await sql`
    INSERT INTO tentacle_iterations (id, seed_id, iteration_number, mode, content, visual_url, tool_combination)
    VALUES (${id}, ${input.seedId}, ${nextIteration}, ${input.mode}, ${input.content}, ${input.visualUrl}, ${input.toolCombination})
  `;
  const nextCooldown = new Date(Date.now() + cooldownMs(nextIteration)).toISOString();
  const toolsTried = new Set(row?.tools_tried ?? []);
  if (input.toolCombination) toolsTried.add(input.toolCombination);
  await sql`
    UPDATE tentacles SET
      mode = ${input.mode},
      iteration_count = ${nextIteration},
      last_run_at = now(),
      cooldown_until = ${nextCooldown},
      tools_tried = ${Array.from(toolsTried)},
      updated_at = now()
    WHERE seed_id = ${input.seedId}
  `;
  return { id, iterationNumber: nextIteration };
}

/** Une itération par son id — ce que la route de visuel lit pour la dessiner. */
export async function iterationById(
  sql: NeonQueryFunction<false, false>,
  id: string,
): Promise<(IterationRow & { title: string | null; parcel_id: string | null }) | null> {
  const rows = (await sql`
    SELECT i.id, i.seed_id, i.iteration_number, i.mode, i.content, i.visual_url, i.tool_combination, i.created_at,
           t.title, t.parcel_id
    FROM tentacle_iterations i
    LEFT JOIN tentacles t ON t.seed_id = i.seed_id
    WHERE i.id = ${id}
  `) as unknown as Array<IterationRow & { title: string | null; parcel_id: string | null }>;
  return rows[0] ?? null;
}

export async function setTentacleMode(sql: NeonQueryFunction<false, false>, seedId: string, mode: TentacleMode): Promise<void> {
  await sql`UPDATE tentacles SET mode = ${mode}, updated_at = now() WHERE seed_id = ${seedId}`;
}