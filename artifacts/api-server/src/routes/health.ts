import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const aiProvider = String(process.env.AI_PROVIDER || "mock").trim().toLowerCase();
  const aiModel = String(process.env.AI_MODEL || "").trim() || null;
  const mistralConfigured = Boolean(process.env.MISTRAL_API_KEY?.trim() || (aiProvider === "mistral" && process.env.AI_API_KEY?.trim()));
  const composioConfigured = Boolean(process.env.COMPOSIO_API_KEY?.trim());
  const databaseConfigured = Boolean(process.env.DATABASE_URL?.trim());

  res.json({
    status: "ok",
    service: "blacklace-publisher-api",
    integrations: {
      database: { configured: databaseConfigured },
      ai: {
        provider: aiProvider,
        model: aiModel,
        configured: aiProvider === "mock" ? false : aiProvider === "mistral" ? mistralConfigured : Boolean(process.env.AI_API_KEY?.trim()),
      },
      mistral: {
        configured: mistralConfigured,
        active: aiProvider === "mistral" && mistralConfigured,
      },
      composio: { configured: composioConfigured },
      knowledge: { connector: String(process.env.KNOWLEDGE_CONNECTOR || "mock") },
    },
  });
});

export default router;
