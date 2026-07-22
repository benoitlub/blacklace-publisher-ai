import { describe, expect, it } from "vitest";
import { qualifyMcpServer } from "./mcp-lab";

const onionServer = {
  id: "kitchen-mcp",
  name: "Kitchen MCP",
  transport: "http" as const,
  tools: [
    {
      name: "slice_onion",
      description: "Slice an onion into thin pieces",
      inputSchema: {
        type: "object",
        properties: {
          onionId: { type: "string" },
          thicknessMm: { type: "number" },
          irrelevantSecret: { type: "string" },
        },
        required: ["onionId", "thicknessMm"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    {
      name: "buy_onions",
      description: "Purchase onions from a supplier",
      inputSchema: {
        type: "object",
        properties: { quantity: { type: "number" } },
        required: ["quantity"],
      },
    },
  ],
};

describe("Publisher MCP laboratory", () => {
  it("selects the useful tool, filters arguments and certifies a ready recipe", () => {
    const pack = qualifyMcpServer(onionServer, {
      capability: "food.onion.slice",
      objective: "émincer finement un oignon",
      preferredTool: "slice_onion",
      sampleInput: {
        onionId: "oignon-42",
        thicknessMm: 2,
        irrelevantSecret: "not-forwarded-because-not-needed-by-request",
        unknownArgument: "must-never-reach-the-tool",
      },
      allowExternalAction: true,
    });

    expect(pack.status).toBe("verified");
    expect(pack.selectedTool?.name).toBe("slice_onion");
    expect(pack.recipe?.arguments).toEqual({
      onionId: "oignon-42",
      thicknessMm: 2,
      irrelevantSecret: "not-forwarded-because-not-needed-by-request",
    });
    expect(pack.recipe?.arguments).not.toHaveProperty("unknownArgument");
    expect(pack.policy.gerardMayRequestCapability).toBe(true);
    expect(pack.policy.octopusMayExecute).toBe(true);
  });

  it("does not pretend an incomplete recipe is executable", () => {
    const pack = qualifyMcpServer(onionServer, {
      capability: "food.onion.slice",
      objective: "émincer finement un oignon",
      preferredTool: "slice_onion",
      sampleInput: { onionId: "oignon-42" },
    });

    expect(pack.status).toBe("needs-review");
    expect(pack.recipe?.missingRequiredInputs).toEqual(["thicknessMm"]);
    expect(pack.policy.octopusMayExecute).toBe(false);
  });
});
