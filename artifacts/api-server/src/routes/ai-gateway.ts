import { Router } from "express";
import { aiGateway, parseAiGatewayRequest } from "../services/ai-gateway";

const router = Router();

router.get("/status", (_req, res) => {
  return res.json(aiGateway.getStatus());
});

router.post("/generate", async (req, res) => {
  const request = parseAiGatewayRequest(req.body);
  if (!request) {
    return res.status(400).json({
      ok: false,
      provider: "none",
      output: "",
      error: "Invalid AI gateway request"
    });
  }

  const response = await aiGateway.generate(request);
  return res.status(response.ok ? 200 : 502).json(response);
});

export default router;
