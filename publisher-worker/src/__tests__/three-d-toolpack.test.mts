import { test } from "node:test";
import assert from "node:assert/strict";
import { buildThreeDToolPack } from "../three-d-toolpack.ts";

test("Creature-Sync GLB plan stays non-executable and reports missing connections", () => {
  const pack = buildThreeDToolPack({ title: "Creature-Sync", imageCount: 4 }, []);
  assert.equal(pack.contract, "publisher-3d-tool-pack-v1");
  assert.equal(pack.format, "glb");
  assert.equal(pack.execution, "dry-run");
  assert.equal(pack.executable, false);
  assert.equal(pack.selected, null);
  assert.equal(pack.tools[0].provider, "meshy");
  assert.equal(pack.tools[0].connectionStatus, "authorization-required");
  assert.equal(pack.tools[1].supportsViews, false);
});

test("an active Meshy account is a candidate, not proof of available credits", () => {
  const pack = buildThreeDToolPack({ imageCount: 4 }, [
    { slug: "meshy", connected: true, discoveredTools: ["MESHY_CREATE_IMAGE_TO_3D_TASK"] },
  ]);
  assert.equal(pack.selected?.provider, "meshy");
  assert.equal(pack.selected?.connected, true);
  assert.equal(pack.selected?.toolAvailable, true);
  assert.equal(pack.cost.verified, false);
  assert.equal(pack.executable, false);
  assert.equal(pack.requiresHumanAuthorization, true);
});

test("rejects unsupported numbers of views", () => {
  for (const n of [-1, 0, 1.5, 5]) {
    assert.throws(() => buildThreeDToolPack({ imageCount: n }, []), /imageCount/);
  }
});

test("does not confuse installed Composio key with confirmed provider connection", () => {
  const pack = buildThreeDToolPack({ imageCount: 1 }, [
    { slug: "meshy", connected: false, discoveredTools: ["MESHY_CREATE_IMAGE_TO_3D_TASK"] },
    { slug: "tripo3d", connected: false, discoveredTools: ["TRIPO3D_GENERATE_MODEL_FROM_IMAGE"] },
  ]);
  assert.equal(pack.selected, null);
  assert.equal(pack.executable, false);
});
