import assert from "node:assert/strict";
import { test } from "node:test";
import { metaverse } from "../metaverse/routes";

const env = {
  OCTOPUS_ENGINE_URL: "https://octopus.example",
  OCTOPUS_ENGINE: {
    async fetch(request: Request) {
      const path = new URL(request.url).pathname;
      const payload = await request.json();
      assert.equal(path, "/mission");
      assert.deepEqual(payload.requiredCapabilities, ["execution.track"]);
      assert.deepEqual(payload.authorizedResources, []);
      assert.equal(payload.prompt, undefined);
      return Response.json({ status: "completed", operationId: payload.operationId });
    },
  },
};

test("requests a procedural Octopus mission and returns a downloadable GLB", async () => {
  const response = await metaverse.request("/generate", {
    method: "POST",
    body: JSON.stringify({ intent: "une caisse rouge" }),
  }, env);
  assert.equal(response.status, 202);
  const result = await response.json();
  assert.equal(result.trace.backendStatus, "completed");
  assert.equal(result.prompt, "v1-crate-red");
  const status = await metaverse.request(result.links.status.replace("/api/metaverse", ""));
  assert.equal((await status.json()).ready, true);
  const model = await metaverse.request(result.links.model.replace("/api/metaverse", ""));
  assert.equal(model.headers.get("content-type"), "model/gltf-binary");
  assert.equal(new TextDecoder().decode((await model.arrayBuffer()).slice(0, 4)), "glTF");
});

test("rejects unsupported intents before calling Octopus", async () => {
  const response = await metaverse.request("/generate", {
    method: "POST",
    body: JSON.stringify({ intent: "entrée du club de Ludmila" }),
  }, {});
  assert.equal(response.status, 400);
});
