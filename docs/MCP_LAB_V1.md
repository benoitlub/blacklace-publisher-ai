# Publisher MCP Laboratory V1

Publisher does not hand a raw MCP server to Gérard.

It first inspects the MCP `tools/list` descriptor, classifies risk, validates schemas, chooses a tool for a requested capability, filters arguments and emits a Tool Pack with an explicit execution policy.

## Canonical flow

```text
MCP server descriptor
        ↓
POST /api/mcp-lab/qualify
        ↓
Publisher qualification
        ↓
verified Tool Pack
        ↓
Gérard may request the capability
        ↓
Octopus may execute the certified recipe
```

## Demonstration: "émincer un oignon"

```json
{
  "server": {
    "id": "kitchen-mcp",
    "name": "Kitchen MCP",
    "transport": "http",
    "tools": [
      {
        "name": "slice_onion",
        "description": "Slice an onion into thin pieces",
        "inputSchema": {
          "type": "object",
          "properties": {
            "onionId": { "type": "string" },
            "thicknessMm": { "type": "number" }
          },
          "required": ["onionId", "thicknessMm"]
        },
        "annotations": {
          "idempotentHint": true
        }
      }
    ]
  },
  "request": {
    "capability": "food.onion.slice",
    "objective": "émincer finement un oignon",
    "preferredTool": "slice_onion",
    "sampleInput": {
      "onionId": "oignon-42",
      "thicknessMm": 2
    },
    "allowExternalAction": true
  }
}
```

Expected result:

- `status: verified`
- `selectedTool.name: slice_onion`
- a recipe containing only schema-approved arguments
- `gerardMayRequestCapability: true`
- `octopusMayExecute: true`

When a required input is missing, Publisher returns `needs-review` and Octopus is not allowed to execute. When no usable schema exists, Publisher rejects the tool rather than pretending it has learned it.

## Boundary

- Publisher qualifies and publishes the recipe.
- Gérard requests the capability, not the raw tool.
- Octopus executes the recipe and enforces authorization.

V1 consumes an MCP discovery descriptor. Live transport discovery, sandbox calls, persistence and health re-checks are the next increments; they must extend this laboratory rather than create a competing architecture.
