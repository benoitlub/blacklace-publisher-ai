import dotenv from 'dotenv';
dotenv.config();
import app from "./app";
import { logger } from "./lib/logger";
import { startPoulpeLife } from "./poulpe-life/runtime";
import { schedulePublisherRegistration } from "./publisher/octopus-registration";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  startPoulpeLife();
  schedulePublisherRegistration();

  logger.info({ port }, "Server listening");
});

// Note — l'ancienne boucle « mode autonome » (scan Notion toutes les 30 min)
// a été retirée : elle importait `syncNotionToKnowledgePacks` depuis
// ./publisher/octopus-observation, qui n'exporte pas cette fonction et ne l'a
// jamais définie. L'import dynamique enveloppé d'un try/catch masquait
// l'erreur, si bien que la boucle échouait en silence à chaque tick tout en
// laissant croire qu'une synchronisation avait lieu.
//
// Le rafraîchissement des Knowledge Packs depuis Notion est déjà assuré, et
// réellement, par le workflow « Autonomous Knowledge Observatory »
// (.github/workflows/autonomous-knowledge-observatory.yml), qui exécute
// scripts/autonomous-knowledge-observatory.mjs chaque jour puis committe les
// packs rafraîchis. Réintroduire une boucle in-process dupliquerait ce
// mécanisme ; si elle redevient nécessaire, elle doit appeler une fonction qui
// existe et échouer bruyamment.