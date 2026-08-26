/**
 * Lit la table `observatory_sources` directement en base, depuis un contexte
 * serveur — pas depuis le navigateur qui a saisi la source.
 *
 * C'est la vérification qui distingue « la source est vraiment persistée »
 * de « la page se souvient d'elle-même » : si une source ajoutée depuis
 * l'Observatoire apparaît ici, le job nocturne GitHub Actions peut la lire
 * lui aussi.
 *
 *   DATABASE_URL="postgres://..." pnpm --filter @workspace/scripts run verify-observatory-sources
 */
import { desc, sql } from "drizzle-orm";
import { db, observatorySourcesTable, pool } from "@workspace/db";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL est requis : c'est la connexion Neon que le Worker utilise.");
  }

  const [{ exists }] = await db.execute<{ exists: boolean }>(
    sql`SELECT to_regclass('public.observatory_sources') IS NOT NULL AS exists`,
  ).then((result) => (Array.isArray(result) ? result : result.rows));

  if (!exists) {
    console.log("La table observatory_sources n'existe pas encore.");
    console.log("Elle est créée à la première écriture du Worker (ensureObservatorySchema).");
    return;
  }

  const rows = await db
    .select()
    .from(observatorySourcesTable)
    .orderBy(desc(observatorySourcesTable.lastObservedAt))
    .limit(50);

  console.log(`observatory_sources : ${rows.length} ligne(s)`);
  const pending = rows.filter((row) => row.processedAt === null && row.decision !== "ignore").length;
  const enriched = rows.filter((row) => row.octopus !== null).length;
  console.log(`  en attente pour le job nocturne : ${pending}`);
  console.log(`  enrichies par Octopus           : ${enriched}`);

  for (const row of rows) {
    console.log(
      [
        `- ${row.name}`,
        `[${row.kind}]`,
        `obs=${row.observationCount}`,
        `décision=${row.decision}`,
        `octopus=${row.octopus ? "oui" : "non"}`,
        `vue le ${row.lastObservedAt.toISOString()}`,
      ].join(" "),
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool?.end());
