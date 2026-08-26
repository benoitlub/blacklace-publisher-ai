/**
 * Test d'intégration de la persistance des sources de l'Observatoire.
 *
 * Il s'exécute contre un vrai Postgres — c'est le seul moyen de vérifier
 * l'UPSERT (moyenne de confiance recalculée, union des tags, remise à zéro
 * de `processed_at`), qui est entièrement écrit en SQL. Sans
 * TEST_DATABASE_URL, il est ignoré plutôt qu'échoué.
 *
 *   TEST_DATABASE_URL="postgres://postgres@localhost:5432/publisher_test" npm test
 *
 * `pg` remplace ici le pilote HTTP Neon : le Worker ne peut pas ouvrir de
 * socket TCP, mais le SQL exécuté est exactement le même.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {
  ensureObservatorySchema,
  listObservatorySources,
  markObservatorySourcesProcessed,
  observatorySourceKey,
  setObservatoryDecision,
  upsertObservatorySource,
  attachObservatoryOctopus,
} from "../db.ts";

const connectionString = process.env.TEST_DATABASE_URL;

/**
 * Adapte les templates balisés de `db.ts` (écrits pour
 * @neondatabase/serverless) au protocole `$1, $2…` de node-postgres.
 */
function pgTaggedSql(pool: pg.Pool) {
  return (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((query, part, index) => query + part + (index < values.length ? `$${index + 1}` : ""), "");
    const result = await pool.query(text, values);
    return result.rows;
  }) as never;
}

test("observatorySourceKey normalise comme le navigateur", () => {
  assert.equal(observatorySourceKey("https://www.Lovable.dev/"), "lovable.dev");
  assert.equal(observatorySourceKey("  HTTP://lovable.dev  "), "http://lovable.dev".replace("http://", ""));
});

test("une source ajoutée depuis l'UI est relisible depuis un autre contexte", { skip: connectionString ? false : "TEST_DATABASE_URL non défini" }, async (t) => {
  const pool = new pg.Pool({ connectionString });
  t.after(() => pool.end());
  const sql = pgTaggedSql(pool);
  await pool.query("DROP TABLE IF EXISTS observatory_sources");
  await ensureObservatorySchema(sql);

  const first = await upsertObservatorySource(sql, {
    kind: "url",
    value: "https://www.Lovable.dev/",
    name: "lovable.dev",
    category: "outil",
    summary: "Générateur d'applications web à partir de prompts.",
    confidence: 0.6,
    tags: ["ia", "no-code"],
    pack: { id: "pack-1", patterns: ["prompt-to-app"] },
  });

  assert.equal(first.observation_count, 1);
  assert.equal(first.source_key, "lovable.dev");
  assert.equal(first.processed_at, null);

  // Une deuxième lecture, sans rien partager avec la première : c'est ce que
  // fait le job nocturne côté serveur.
  const seenFromElsewhere = await listObservatorySources(pgTaggedSql(pool), { pendingOnly: true });
  assert.equal(seenFromElsewhere.length, 1);
  assert.equal(seenFromElsewhere[0].value, "https://www.Lovable.dev/");
  assert.deepEqual([...seenFromElsewhere[0].tags].sort(), ["ia", "no-code"]);

  // Ré-observer la même URL (www., slash final, casse différente) met la
  // fiche à jour au lieu d'en créer une seconde.
  const second = await upsertObservatorySource(sql, {
    kind: "url",
    value: "https://lovable.dev",
    name: "lovable.dev",
    confidence: 0.8,
    tags: ["ia", "react"],
  });
  assert.equal(second.id, first.id);
  assert.equal(second.observation_count, 2);
  assert.ok(Math.abs(Number(second.average_confidence) - 0.7) < 1e-6);
  assert.deepEqual([...second.tags].sort(), ["ia", "no-code", "react"]);
  // Ni la catégorie ni le pack déjà connus ne sont écrasés par une
  // observation qui ne les fournit pas.
  assert.equal(second.category, "outil");
  assert.ok(second.pack);

  const enriched = await attachObservatoryOctopus(sql, first.id, { relevanceScore: 42, summary: "Signal nouveau." });
  assert.equal((enriched?.octopus as { relevanceScore: number }).relevanceScore, 42);

  // Le job nocturne vide la file ; la source n'y revient qu'à la prochaine
  // observation.
  assert.equal(await markObservatorySourcesProcessed(sql, [first.id]), 1);
  assert.equal((await listObservatorySources(sql, { pendingOnly: true })).length, 0);
  assert.equal((await listObservatorySources(sql)).length, 1);

  const reobserved = await upsertObservatorySource(sql, { kind: "url", value: "https://lovable.dev", name: "lovable.dev", confidence: 0.9 });
  assert.equal(reobserved.processed_at, null);
  assert.equal((await listObservatorySources(sql, { pendingOnly: true })).length, 1);

  // Une source ignorée sort de la file du job nocturne sans être supprimée.
  await setObservatoryDecision(sql, first.id, "ignore");
  assert.equal((await listObservatorySources(sql, { pendingOnly: true })).length, 0);
  assert.equal((await listObservatorySources(sql)).length, 1);
});
