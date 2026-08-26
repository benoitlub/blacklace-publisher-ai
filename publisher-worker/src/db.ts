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

export async function recordIteration(sql: NeonQueryFunction<false, false>, input: {
  seedId: string; mode: TentacleMode; content: string | null; visualUrl: string | null; toolCombination: string | null;
}): Promise<void> {
  const [current] = await sql`SELECT iteration_count, tools_tried FROM tentacles WHERE seed_id = ${input.seedId}`;
  const row = current as unknown as { iteration_count: number; tools_tried: string[] } | undefined;
  const nextIteration = (row?.iteration_count ?? 0) + 1;
  const id = `iter_${input.seedId}_${Date.now()}`;
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
}

export async function setTentacleMode(sql: NeonQueryFunction<false, false>, seedId: string, mode: TentacleMode): Promise<void> {
  await sql`UPDATE tentacles SET mode = ${mode}, updated_at = now() WHERE seed_id = ${seedId}`;
}
// ---------------------------------------------------------------------------
// Observatory sources
//
// L'Observatoire du dashboard n'écrivait que dans le localStorage du
// navigateur : une source ajoutée depuis l'UI n'existait nulle part côté
// serveur, donc le job nocturne (Autonomous Knowledge Observatory) n'avait
// rien à observer et les compteurs "Entrées / Observations / Enrichies par
// Octopus" restaient à 0 sur tout autre appareil. Ces tables sont le
// pendant serveur de ObservationMemoryEntry
// (artifacts/blacklace-publisher/src/models/observation-memory.ts).
// ---------------------------------------------------------------------------

export type ObservatoryDecision = "watch" | "ignore" | "seed" | "harvest" | "article" | "compare";

export const OBSERVATORY_DECISIONS: readonly ObservatoryDecision[] = [
  "watch",
  "ignore",
  "seed",
  "harvest",
  "article",
  "compare",
];

export interface ObservatorySourceRow {
  id: string;
  source_key: string;
  kind: string;
  value: string;
  name: string;
  category: string | null;
  summary: string | null;
  average_confidence: number;
  tags: string[];
  decision: ObservatoryDecision;
  observation_count: number;
  pack: unknown;
  octopus: unknown;
  first_observed_at: string;
  last_observed_at: string;
  processed_at: string | null;
  updated_at: string;
}

export interface ObservatorySourceInput {
  id?: string;
  kind: string;
  value: string;
  name?: string;
  category?: string;
  summary?: string;
  confidence?: number;
  tags?: string[];
  pack?: unknown;
}

/**
 * Même normalisation que `normalizeKey` côté navigateur
 * (memory/observation-memory.ts) : c'est elle qui décide qu'une deuxième
 * observation de la même URL met à jour la fiche existante au lieu d'en
 * créer une seconde.
 */
export function observatorySourceKey(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

let observatorySchemaEnsured = false;

export async function ensureObservatorySchema(sql: NeonQueryFunction<false, false>): Promise<void> {
  if (observatorySchemaEnsured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS observatory_sources (
      id TEXT PRIMARY KEY,
      source_key TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      value TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT,
      summary TEXT,
      average_confidence REAL NOT NULL DEFAULT 0,
      tags TEXT[] NOT NULL DEFAULT '{}',
      decision TEXT NOT NULL DEFAULT 'watch',
      observation_count INTEGER NOT NULL DEFAULT 1,
      pack JSONB,
      octopus JSONB,
      first_observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      processed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS observatory_sources_last_observed_idx ON observatory_sources (last_observed_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS observatory_sources_processed_at_idx ON observatory_sources (processed_at)`;
  observatorySchemaEnsured = true;
}

/**
 * Insère la source, ou fusionne une nouvelle observation dans la fiche
 * existante (compteur, moyenne de confiance, union des tags). Remet
 * `processed_at` à NULL : une nouvelle observation redevient du travail en
 * attente pour le job nocturne. `decision` n'est jamais écrasée — elle
 * appartient à l'utilisateur, pas à l'observation.
 */
export async function upsertObservatorySource(
  sql: NeonQueryFunction<false, false>,
  input: ObservatorySourceInput,
): Promise<ObservatorySourceRow> {
  const value = input.value.trim();
  if (!value) throw new Error("Une source doit avoir une valeur.");
  const sourceKey = observatorySourceKey(value);
  const id = input.id?.trim() || `obs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const name = (input.name || value).trim().slice(0, 200);
  const confidence = Number.isFinite(input.confidence) ? Number(input.confidence) : 0;
  const tags = [...new Set((input.tags ?? []).map((tag) => String(tag).trim()).filter(Boolean))];

  const rows = await sql`
    INSERT INTO observatory_sources (
      id, source_key, kind, value, name, category, summary, average_confidence, tags, observation_count, pack
    ) VALUES (
      ${id}, ${sourceKey}, ${input.kind}, ${value}, ${name}, ${input.category ?? null}, ${input.summary ?? null},
      ${confidence}, ${tags}, 1, ${input.pack ? JSON.stringify(input.pack) : null}
    )
    ON CONFLICT (source_key) DO UPDATE SET
      kind = EXCLUDED.kind,
      value = EXCLUDED.value,
      name = EXCLUDED.name,
      category = COALESCE(EXCLUDED.category, observatory_sources.category),
      summary = COALESCE(EXCLUDED.summary, observatory_sources.summary),
      average_confidence = (
        (observatory_sources.average_confidence * observatory_sources.observation_count) + EXCLUDED.average_confidence
      ) / (observatory_sources.observation_count + 1),
      tags = ARRAY(SELECT DISTINCT unnest(observatory_sources.tags || EXCLUDED.tags)),
      observation_count = observatory_sources.observation_count + 1,
      pack = COALESCE(EXCLUDED.pack, observatory_sources.pack),
      last_observed_at = now(),
      processed_at = NULL,
      updated_at = now()
    RETURNING *
  `;
  return rows[0] as unknown as ObservatorySourceRow;
}

export async function listObservatorySources(
  sql: NeonQueryFunction<false, false>,
  options: { limit?: number; pendingOnly?: boolean } = {},
): Promise<ObservatorySourceRow[]> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const rows = options.pendingOnly
    ? await sql`
        SELECT * FROM observatory_sources
        WHERE processed_at IS NULL AND decision <> 'ignore'
        ORDER BY last_observed_at DESC
        LIMIT ${limit}
      `
    : await sql`SELECT * FROM observatory_sources ORDER BY last_observed_at DESC LIMIT ${limit}`;
  return rows as unknown as ObservatorySourceRow[];
}

export async function attachObservatoryOctopus(
  sql: NeonQueryFunction<false, false>,
  id: string,
  octopus: unknown,
): Promise<ObservatorySourceRow | null> {
  const rows = await sql`
    UPDATE observatory_sources
    SET octopus = ${JSON.stringify(octopus)}, updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return (rows[0] as unknown as ObservatorySourceRow) ?? null;
}

export async function setObservatoryDecision(
  sql: NeonQueryFunction<false, false>,
  id: string,
  decision: ObservatoryDecision,
): Promise<ObservatorySourceRow | null> {
  const rows = await sql`
    UPDATE observatory_sources
    SET decision = ${decision}, updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return (rows[0] as unknown as ObservatorySourceRow) ?? null;
}

export async function markObservatorySourcesProcessed(
  sql: NeonQueryFunction<false, false>,
  ids: string[],
): Promise<number> {
  const wanted = [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
  if (!wanted.length) return 0;
  const rows = await sql`
    UPDATE observatory_sources
    SET processed_at = now(), updated_at = now()
    WHERE id = ANY(${wanted})
    RETURNING id
  `;
  return rows.length;
}
