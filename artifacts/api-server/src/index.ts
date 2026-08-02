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
  
  // ========== MODE AUTONOME PUBLISHER ==========
  startAutonomousPublisher();
  // ========== FIN MODE AUTONOME ==========
  
  logger.info({ port }, "Server listening");
});

// Mode autonome : Publisher scan Notion toutes les 30 minutes
function startAutonomousPublisher() {
  logger.info("🐙 Publisher en mode autonome");
  
  // Sync immédiate 10 secondes après le boot
  setTimeout(() => {
    syncNotionNow().catch((e) => logger.error({ err: e }, "Sync initiale échouée"));
  }, 10000);
  
  // Puis toutes les 30 minutes
  setInterval(() => {
    syncNotionNow().catch((e) => logger.error({ err: e }, "Sync planifiée échouée"));
  }, 1000 * 60 * 30);
}

async function syncNotionNow() {
  logger.info("🔍 [Autonome] Scan Notion...");
  try {
    // Appelle ta fonction existante de sync
    const { syncNotionToKnowledgePacks } = await import("./publisher/octopus-observation");
    await syncNotionToKnowledgePacks();
    logger.info("✅ [Autonome] Sync Notion terminée");
  } catch (e) {
    logger.error({ err: e }, "❌ [Autonome] Erreur sync Notion");
  }
}
