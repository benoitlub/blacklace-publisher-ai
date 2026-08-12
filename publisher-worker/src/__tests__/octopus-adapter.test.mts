import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADAPTER_EXECUTION_CONTRACT,
  PUBLISHER_ADAPTER_CAPABILITIES,
  executeAdapterMission,
  requestedCapability,
} from "../octopus-adapter.ts";

const knowledgeEnv = {};

function mission(overrides: Record<string, unknown> = {}) {
  return {
    contract: ADAPTER_EXECUTION_CONTRACT,
    adapterId: "publisher",
    mission: {
      operationId: "op-1",
      title: "Rotas — place du marché",
      objective: "Transformer une intention créative en prompt text-to-3D.",
      requiredCapabilities: ["content.generate"],
      authorizedResources: ["mistral"],
      prompt: "Place du Marché de Rotas, fontaine centrale, pierre chaude",
      context: { id: "op-1", label: "metaverse-creator" },
      ...overrides,
    },
  };
}

const generateText = async (request: { title: string; prompt: string }) => ({
  id: "mistral-text-1",
  title: request.title,
  content: `PROMPT:${request.prompt}`,
});

test("content.generate is declared — it is what other services ask for", () => {
  assert.ok(PUBLISHER_ADAPTER_CAPABILITIES.includes("content.generate"));
});

test("executes a text mission and exposes the result where callers look for it", async () => {
  const result = await executeAdapterMission(mission(), { generateText, knowledgeEnv });

  assert.equal(result.status, "completed");
  assert.equal(result.operationId, "op-1");
  // A generic consumer reads output.text first; metaverse-creator's
  // extractGeneratedText relies on exactly this.
  assert.match(String(result.output.text), /Place du Marché de Rotas/);
  assert.equal(result.output.content, result.output.text);
  assert.equal(result.artifacts?.[0]?.content, result.output.text);
});

test("falls back to the objective when the mission carries no prompt", async () => {
  const result = await executeAdapterMission(mission({ prompt: undefined }), {
    generateText,
    knowledgeEnv,
  });

  assert.equal(result.status, "completed");
  assert.match(String(result.output.text), /text-to-3D/);
});

test("reports an unsupported capability instead of guessing one", async () => {
  const result = await executeAdapterMission(mission({ requiredCapabilities: ["video.render"] }), {
    generateText,
    knowledgeEnv,
  });

  assert.equal(result.status, "failed");
  assert.deepEqual(result.output.requiredCapabilities, ["video.render"]);
});

test("rejects an unknown contract", async () => {
  const result = await executeAdapterMission(
    { ...mission(), contract: "octopus-adapter-execution-v2" },
    { generateText, knowledgeEnv },
  );

  assert.equal(result.status, "failed");
  assert.match(result.summary, /Contrat non supporté/);
});

test("surfaces a producer failure as a readable outcome, never a throw", async () => {
  const result = await executeAdapterMission(mission(), {
    generateText: async () => {
      throw new Error("Mistral n'est pas configuré dans Publisher.");
    },
    knowledgeEnv,
  });

  assert.equal(result.status, "failed");
  assert.match(result.summary, /Mistral/);
});

test("picks capabilities in declaration order", () => {
  assert.equal(
    requestedCapability({ operationId: "x", requiredCapabilities: ["copy.generate", "content.generate"] }),
    "content.generate",
  );
  assert.equal(requestedCapability({ operationId: "x", requiredCapabilities: [] }), undefined);
});
