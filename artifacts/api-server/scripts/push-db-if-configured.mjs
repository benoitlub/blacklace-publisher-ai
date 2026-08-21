import { spawnSync } from "node:child_process";

/**
 * Applique le schéma Drizzle avant le build de l'API — sur demande explicite
 * seulement.
 *
 * Ce script était auparavant déclenché par la simple présence de
 * `DATABASE_URL`. Or `DATABASE_URL` est fourni à tout processus qui doit
 * seulement *lire* la base : le workflow « Gerard runtime » de poulpe-fiction,
 * par exemple, démarre l'api-server avec l'URL Neon de production. Chaque cycle
 * de Gérard déclenchait donc un `drizzle-kit push` contre la base réelle, qui
 * proposait de supprimer les tables que ce schéma ne déclare pas :
 *
 *   · tentacles                  12 lignes
 *   · tentacle_iterations       779 lignes
 *   · octopus_missions / octopus_events / octopus_memory / …
 *
 * Ces tables appartiennent au Worker, pas à `@workspace/db` : le schéma de
 * l'api-server n'est plus l'autorité sur cette base. Seule l'absence de TTY sur
 * le runner empêchait la suppression de se confirmer — et `pnpm push-force`
 * existe à côté, qui ne demande rien à personne.
 *
 * Le push est donc désormais une action volontaire : `DB_PUSH=1`. Sans ce
 * drapeau, la présence de `DATABASE_URL` ne déclenche plus rien.
 */

const requested = process.env.DB_PUSH === "1";

if (!requested) {
  console.log(
    "DB_PUSH n'est pas à 1 : aucun push de schéma. " +
      "Le build n'applique plus le schéma implicitement (voir le commentaire de ce fichier).",
  );
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.error("DB_PUSH=1 mais DATABASE_URL est absent : impossible d'appliquer le schéma.");
  process.exit(1);
}

console.log("DB_PUSH=1 : application du schéma Drizzle avant le build de l'API...");
const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(command, ["--filter", "@workspace/db", "push"], {
  cwd: new URL("../../../", import.meta.url),
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error("Impossible de lancer le push Drizzle :", result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
