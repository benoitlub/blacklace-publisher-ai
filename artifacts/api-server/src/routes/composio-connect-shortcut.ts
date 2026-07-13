import { Router } from "express";

const router = Router();
const SUPPORTED_TOOLKITS = new Set(["canva", "elevenlabs", "notion"]);

function normalizeToolkit(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

router.post("/connectors/composio/connect", (req, res) => {
  const toolkit = normalizeToolkit(req.body?.provider);
  if (!SUPPORTED_TOOLKITS.has(toolkit)) {
    return res.status(400).json({
      error: `Connexion ${toolkit || "inconnue"} non prise en charge par le parcours direct.`,
    });
  }

  const forwardedProto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const forwardedHost = String(req.headers["x-forwarded-host"] || req.headers.host || "blacklace-publisher-api.onrender.com").split(",")[0].trim();
  const origin = `${forwardedProto}://${forwardedHost}`;
  const redirectUrl = `${origin}/api/production/connections/${encodeURIComponent(toolkit)}/authorize`;

  return res.json({
    provider: toolkit,
    status: "authorization-route-ready",
    redirectUrl,
  });
});

export default router;
