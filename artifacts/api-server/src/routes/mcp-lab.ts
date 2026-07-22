import { Router } from "express";
import { qualifyMcpServer, type CapabilityRequest, type McpServerDescriptor } from "../services/mcp-lab";

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

router.get("/contract", (_req, res) => {
  return res.json({
    version: 1,
    purpose: "Publisher inspects MCP tools and emits a verified Tool Pack before Gerard may request the capability.",
    input: {
      server: "MCP discovery descriptor with tools/list result",
      request: "capability, objective, optional preferredTool and sampleInput",
    },
    output: {
      status: ["verified", "needs-review", "rejected"],
      selectedTool: "qualified MCP tool",
      recipe: "filtered arguments and execution policy",
      policy: "what Gerard and Octopus may do",
    },
    invariant: "Publisher qualifies; Gerard requests; Octopus executes.",
  });
});

export default router;
