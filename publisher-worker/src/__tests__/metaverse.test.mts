import assert from "node:assert/strict";
import { test } from "node:test";
import { metaverse } from "../metaverse/routes";

const env = {
  OCTOPUS_ENGINE_URL: "https://octopus.example",
  PUBLISHER_PUBLIC_URL: "https://publisher.example",
  OCTOPUS_ENGINE: {
    async fetch(request: Request) {
      const path = new URL(request.url).pathname;
      const payload = await request.json();
      if (path === "/adapters/register") {
        assert.equal(payload.executeUrl, "https://publisher.example/api/metaverse/execute");
        return Response.json({ status: "registered" }, { status: 201 });
      }
      assert.equal(path, "/mission");
      assert.equal(payload.prompt, "crate red");
      assert.deepEqual(payload.authorizedResources, []);
      const callback = await metaverse.request("/execute", {
        method: "POST",
        body: JSON.stringify({ contract: "octopus-adapter-execution-v1", adapterId: "metaverse-procedural", mission: payload }),
      });
      return Response.json({ ...await callback.json(), adapterId: "metaverse-procedural" });
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
