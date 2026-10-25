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

test("tool.search discovers read-only tools even when the Observatory database is offline", async () => {
  let discoveryCalls = 0;
  const result = await executeAdapterMission(mission({ requiredCapabilities: ["tool.search"] }), {
    generateText, knowledgeEnv,
    discoverTools: async () => {
      discoveryCalls += 1;
      return { status: "discovered", tools: [{ slug: "search" }] };
    },
  });
  assert.equal(result.status, "completed");
  assert.equal(result.output.observatoryAvailable, false);
  assert.equal(result.output.executable, false);
  assert.equal(result.output.authorizationRequired, true);
  assert.equal(discoveryCalls, 1);
});

test("social.publish requires explicit authorization and never generates content", async t => {
  const producer = t.mock.fn(generateText);
  const result = await executeAdapterMission(mission({ requiredCapabilities: ["social.publish"] }), {
    generateText: producer, knowledgeEnv,
  });
  assert.equal(result.status, "needs-input");
  assert.equal(result.output.authorizationRequired, true);
  assert.equal(result.output.requiredAuthorization, "social.publish");
  assert.equal(result.output.executable, false);
  assert.equal(producer.mock.callCount(), 0);
});

test("authorization alone does not invent an active publishing executor", async t => {
  const producer = t.mock.fn(generateText);
  const result = await executeAdapterMission(mission({
    requiredCapabilities: ["social.publish"], authorizedResources: ["social.publish"],
  }), { generateText: producer, knowledgeEnv });
  assert.equal(result.status, "needs-input");
  assert.equal(result.output.authorizationRequired, false);
  assert.equal(result.output.executable, false);
  assert.equal(producer.mock.callCount(), 0);
});

test("social delivery needs a nonempty provider ID and the matching confirmed flag", async () => {
  for (const output of [
    { status: "confirmed-scheduled", scheduled: true },
    { status: "confirmed-scheduled", scheduled: true, postId: " " },
    { status: "confirmed-scheduled", scheduled: false, postId: "unverified" },
  ]) {
    const result = await executeAdapterMission(mission({ requiredCapabilities: ["social.publish"], authorizedResources: ["social.publish"],
      context: { metadata: { socialPublication: { transport: "buffer", dryRun: false } } },
    }), { generateText, knowledgeEnv, publishSocial: async () => output });
    assert.equal(result.status, "needs-input");
  }
});
