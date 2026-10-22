import test from "node:test";
import assert from "node:assert/strict";
import workerModule from "../worker.ts";
const worker = "fetch" in workerModule ? workerModule : workerModule.default;
const request = { operationId: "test-operation", harvestId: "harvest", text: "Une décision", media: [], networks: ["facebook"], source: "gerard", decision: "schedule", dryRun: false };

test("public finalize cannot schedule without both bearer and server activation", async t => {
  const network = t.mock.method(globalThis, "fetch", async () => { throw new Error("must not access any service"); });
  for (const [env, headers] of [
    [{ METRICOOL_PUBLISHING_ENABLED: "true" }, {}],
    [{ METRICOOL_EXECUTION_TOKEN: "simulated-token", METRICOOL_PUBLISHING_ENABLED: "false" }, { Authorization: "Bearer simulated-token" }],
  ]) {
    const response = await worker.fetch(new Request("https://publisher.test/api/social/publication/finalize", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(request) }), env);
    const body = await response.json();
    assert.equal(body.scheduled, false); assert.equal(body.stage, "authorization");
  }
  assert.equal(network.mock.callCount(), 0);
});
test("unsupported networks, cross-harvest media and caller-chosen dates are rejected before any dependency", async t => {
  const network = t.mock.method(globalThis, "fetch", async () => { throw new Error("must not access any service"); });
  for (const extra of [{ networks: ["facebook", "unknown"] }, { mediaHarvestId: "another-harvest" }, { publicationDate: "2026-10-23T10:00:00" }]) {
    const response = await worker.fetch(new Request("https://publisher.test/api/social/publication/finalize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...request, ...extra }) }), {});
    const body = await response.json(); assert.equal(body.stage, "editorial-validation"); assert.equal(body.scheduled, false);
  }
  assert.equal(network.mock.callCount(), 0);
});
test("null JSON produces a readable rejected result instead of a handler exception", async () => {
  const response = await worker.fetch(new Request("https://publisher.test/api/social/publication/finalize", { method: "POST", headers: { "Content-Type": "application/json" }, body: "null" }), {});
  assert.equal((await response.json()).status, "rejected");
});
