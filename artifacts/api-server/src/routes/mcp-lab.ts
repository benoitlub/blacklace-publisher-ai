import { Router } from "express";
import { readGlobalState, writeGlobalState } from "../services/global-state";
import { qualifyMcpServer, type CapabilityRequest, type McpServerDescriptor } from "../services/mcp-lab";
import { tickPublisherLife, type McpQualificationCandidate, type PublisherLifeStatus } from "../publisher-life/runtime";

const router = Router();

router.post("/qualify", (req, res) => {
  try {
    const descriptor = req.body?.server as McpServerDescriptor;
    const request = req.body?.request as CapabilityRequest;
    const toolPack = qualifyMcpServer(descriptor, request);
    return res.status(toolPack.status === "rejected" ? 422 : 200).json(toolPack);
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "MCP qualification failed",
    });
  }
});

router.post("/candidates", async (req, res) => {
  try {
    const candidate = req.body as McpQualificationCandidate;
    if (!candidate?.id || !candidate.descriptor?.id || !Array.isArray(candidate.requests) || candidate.requests.length === 0) {
      return res.status(400).json({ error: "candidate{id, descriptor, requests[]} is required" });
    }
    const saved = await writeGlobalState("mcp-candidates", candidate.id, {
      ...candidate,
      enabled: candidate.enabled !== false,
      discoveredAt: candidate.discoveredAt ?? new Date().toISOString(),
    });
    return res.status(201).json(saved);
  } catch (error) {
    return res.status(503).json({ error: error instanceof Error ? error.message : "MCP candidate could not be stored" });
  }
});

router.get("/status", async (_req, res) => {
  try {
    const status = await readGlobalState<PublisherLifeStatus>("publisher-life", "status");
    return res.json(status?.value ?? {
      running: false,
      lastTickAt: null,
      note: "Publisher life has not completed its first server tick yet.",
    });
  } catch (error) {
    return res.status(503).json({ error: error instanceof Error ? error.message : "Publisher life status unavailable" });
  }
});

router.post("/tick", async (_req, res) => {
  const status = await tickPublisherLife();
  return res.json(status);
});

router.get("/contract", (_req, res) => {
  return res.json({
    version: 2,
    purpose: "Publisher inspects MCP tools, stores candidates and autonomously refreshes verified Tool Packs before Gerard may request a capability.",
    input: {
      server: "MCP discovery descriptor with tools/list result",
      request: "capability, objective, optional preferredTool and sampleInput",
      candidate: "persistent server descriptor plus one or more capability requests",
    },
    autonomousCycle: [
      "read enabled MCP candidates from persistent state",
      "requalify candidates when their refresh delay expires",
      "persist Tool Packs and Publisher activity",
      "expose capability permissions for Gerard and Octopus",
    ],
    output: {
      status: ["verified", "needs-review", "rejected"],
      selectedTool: "qualified MCP tool",
      recipe: "filtered arguments and execution policy",
      policy: "what Gerard and Octopus may do",
    },
    invariant: "Publisher qualifies autonomously; Gerard requests; Octopus executes.",
  });
});

export default router;