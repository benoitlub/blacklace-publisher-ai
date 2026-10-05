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

export async function databaseBindingDiagnostics(env: { DATABASE_URL?: string | SecretsStoreSecret }): Promise<Record<string, unknown>> {
  const binding = env.DATABASE_URL;
  if (typeof binding === "string") return { bindingPresent: true, bindingKind: "string", getSucceeded: true, nonEmpty: Boolean(binding.trim()) };
  if (!binding) return { bindingPresent: false, bindingKind: "missing", getSucceeded: false, nonEmpty: false };
  const getter = (binding as SecretsStoreSecret).get;
  if (typeof getter !== "function") return { bindingPresent: true, bindingKind: typeof binding, getSucceeded: false, nonEmpty: false, error: "Binding has no get() method" };
  try {
    const value = await (binding as SecretsStoreSecret).get();
    return { bindingPresent: true, bindingKind: "secrets-store", getSucceeded: true, nonEmpty: typeof value === "string" && Boolean(value.trim()) };
  } catch (error) {
    return { bindingPresent: true, bindingKind: "secrets-store", getSucceeded: false, nonEmpty: false, error: error instanceof Error ? error.message : String(error) };
  }
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

export interface GardenHarvestInput {
  id: string;
  parcelId: string;
  seedId?: string | null;
  operationId?: string | null;
  title: string;
  content?: string | null;
  url?: string | null;
  downloadUrl?: string | null;
  type?: string | null;
  status?: string | null;
  createdAt?: string | null;
}

export async function ensureGardenHarvestSchema(sql: NeonQueryFunction<false, false>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS garden_harvests (
      id TEXT PRIMARY KEY,
      parcel_id TEXT NOT NULL,
      seed_id TEXT,
      operation_id TEXT,
      title TEXT NOT NULL,
      content TEXT,
      url TEXT,
      download_url TEXT,
      type TEXT,
      status TEXT,
      source TEXT NOT NULL DEFAULT 'poulpe-fiction-garden',
      created_at TIMESTAMPTZ,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS garden_harvests_created_at_idx ON garden_harvests (created_at DESC)`;
}

export async function upsertGardenHarvests(sql: NeonQueryFunction<false, false>, harvests: GardenHarvestInput[]): Promise<number> {
  await ensureGardenHarvestSchema(sql);
  let count = 0;
  for (const item of harvests) {
    if (!item.id || !item.parcelId || !item.title) continue;
    await sql`
      INSERT INTO garden_harvests (id, parcel_id, seed_id, operation_id, title, content, url, download_url, type, status, created_at)
      VALUES (${item.id}, ${item.parcelId}, ${item.seedId ?? null}, ${item.operationId ?? null}, ${item.title}, ${item.content ?? null}, ${item.url ?? null}, ${item.downloadUrl ?? null}, ${item.type ?? null}, ${item.status ?? null}, ${item.createdAt ?? null})
      ON CONFLICT (id) DO UPDATE SET
        parcel_id = EXCLUDED.parcel_id,
        seed_id = EXCLUDED.seed_id,
        operation_id = EXCLUDED.operation_id,
        title = EXCLUDED.title,
        content = EXCLUDED.content,
        url = EXCLUDED.url,
        download_url = EXCLUDED.download_url,
        type = EXCLUDED.type,
        status = EXCLUDED.status,
        synced_at = now()
    `;
    count += 1;
  }
  return count;
}

export interface GardenHarvestRow {
  id: string;
  parcel_id: string;
  seed_id: string | null;
  operation_id: string | null;
  title: string;
  content: string | null;
  url: string | null;
  download_url: string | null;
  type: string | null;
  status: string | null;
  source: string;
  created_at: string | null;
  synced_at: string;
}

export async function listGardenHarvests(
  sql: NeonQueryFunction<false, false>,
  options: { limit?: number; seedId?: string; reusableOnly?: boolean } = {},
): Promise<GardenHarvestRow[]> {
  await ensureGardenHarvestSchema(sql);
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const seedId = options.seedId?.trim() || null;
  const reusableOnly = options.reusableOnly !== false;
  const rows = await sql`
    SELECT *
    FROM garden_harvests
    WHERE (${seedId}::text IS NULL OR seed_id = ${seedId})
      AND (
        ${reusableOnly} = false
        OR (
          COALESCE(lower(status), '') NOT IN ('failed', 'error', 'deleted', 'composted')
          AND (
            NULLIF(trim(COALESCE(content, '')), '') IS NOT NULL
            OR NULLIF(trim(COALESCE(url, '')), '') IS NOT NULL
            OR NULLIF(trim(COALESCE(download_url, '')), '') IS NOT NULL
          )
        )
      )
    ORDER BY COALESCE(created_at, synced_at) DESC
    LIMIT ${limit}
  `;
  return rows as unknown as GardenHarvestRow[];
}

export async function getGardenHarvestById(
  sql: NeonQueryFunction<false, false>,
  harvestId: string,
): Promise<GardenHarvestRow | null> {
  await ensureGardenHarvestSchema(sql);
  const rows = await sql`SELECT * FROM garden_harvests WHERE id = ${harvestId} LIMIT 1`;
  return (rows[0] as unknown as GardenHarvestRow) ?? null;
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


export async function buildObservatoryToolPack(
  sql: NeonQueryFunction<false, false>,
  input: { seedId: string; deliverable?: string; limit?: number; gardenContext?: Record<string, unknown> },
): Promise<{ version: number; seedId: string; deliverable: string; generatedAt: string; context: Record<string, unknown>; tools: Array<Record<string, unknown>>; source: string }> {
  await ensureObservatorySchema(sql);
  const rows = await listObservatorySources(sql, { limit: 500 });
  const normalize = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const records = (value: unknown) => Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
  const garden = input.gardenContext && input.gardenContext.contract === "garden-context-v1" ? input.gardenContext : {};
  const seeds = records(garden.seeds);
  const harvests = records(garden.recentHarvests);
  const operations = records(garden.recentOperations);
  const compost = records(garden.recentCompost);
  const contextText = normalize([
    ...seeds.flatMap((item) => [item.title, item.objective]),
    ...harvests.map((item) => item.title),
    ...compost.map((item) => item.reason),
  ].filter(Boolean).join(" "));
  const failedCapabilities = new Set(operations
    .filter((item) => /fail|skip|error/i.test(String(item.status ?? "")))
    .map((item) => normalize(item.capability))
    .filter(Boolean));
  const seed = normalize(input.seedId);
  const deliverable = normalize(input.deliverable);
  const families: Record<string, string[]> = {
    video: ["video", "kling", "runway", "animation", "reel", "tiktok"],
    voice: ["voice", "voix", "audio", "elevenlabs", "tts"],
    visual: ["image", "visuel", "canva", "design", "illustration"],
    publish: ["metricool", "publication", "schedule", "instagram", "social"],
    landing: ["landing", "html", "site", "page", "web"],
  };
  const ranked = rows
    .filter((row) => row.decision !== "ignore")
    .map((row) => {
      const pack = row.pack && typeof row.pack === "object" && !Array.isArray(row.pack) ? row.pack as Record<string, unknown> : {};
      const capabilities = Array.isArray(pack.capabilities) ? pack.capabilities.map(String) : row.tags;
      const recipe = typeof pack.recipe === "string" ? pack.recipe : undefined;
      const haystack = normalize([row.name, row.category, row.summary, row.value, ...row.tags, ...capabilities, recipe].filter(Boolean).join(" "));
      let score = Math.max(1, Math.round(row.average_confidence * 10));
      for (const token of [...seed.split(" "), ...deliverable.split(" ")].filter((token) => token.length > 2)) if (haystack.includes(token)) score += 4;
      for (const token of contextText.split(" ").filter((token) => token.length > 3)) if (haystack.includes(token)) score += 2;
      for (const [family, terms] of Object.entries(families)) if (deliverable.includes(family) && terms.some((term) => haystack.includes(term))) score += 12;
      const previouslyFailed = capabilities.some((capability) => failedCapabilities.has(normalize(capability)));
      if (previouslyFailed) score -= 8;
      return { row, pack, capabilities, recipe, score, previouslyFailed };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(Math.max(input.limit ?? 12, 1), 25))
    .map(({ row, pack, capabilities, recipe, score, previouslyFailed }) => ({
      id: row.id,
      name: row.name,
      role: typeof pack.role === "string" ? pack.role : (row.category ?? deliverable) || "production",
      reason: previouslyFailed
        ? `Pertinent pour le besoin, mais une capacité similaire a déjà échoué dans le Garden. ${row.summary ?? ""}`.trim()
        : row.summary ?? `Outil observé pertinent pour ${input.deliverable || input.seedId}`,
      recipe: recipe ?? "À préciser depuis l'Observatoire",
      capabilities,
      url: row.value.startsWith("http") ? row.value : null,
      confidence: Math.min(0.99, Math.max(0.4, row.average_confidence || score / 20)),
      source: "publisher-observatory-neon",
      decision: row.decision,
      observationCount: row.observation_count,
      gardenSignals: { previouslyFailed },
    }));
  return {
    version: 3,
    seedId: input.seedId,
    deliverable: input.deliverable ?? "",
    generatedAt: new Date().toISOString(),
    context: {
      contract: garden.contract === "garden-context-v1" ? "garden-context-v1" : null,
      seedsSeen: seeds.length,
      harvestsSeen: harvests.length,
      operationsSeen: operations.length,
      compostSeen: compost.length,
      failedCapabilities: [...failedCapabilities],
    },
    tools: ranked,
    source: "publisher-observatory-neon",
  };
}
