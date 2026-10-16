import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.ts";

test("Publisher preflight returns a non-billable GLB plan when Composio is unconfigured", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/api/production/3d/preflight?imageCount=4"),
    {} as never,
  );
  assert.equal(response.status, 200);
  const body = await response.json() as Record<string, any>;
  assert.equal(body.status, "planned");
  assert.equal(body.execution, "dry-run");
  assert.equal(body.executable, false);
  assert.equal(body.providerInventory, "not-configured");
  assert.equal(body.selected, null);
  assert.equal(body.imageCount, 4);
});

test("Publisher plans the Creature-Sync job without receiving image bytes", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/api/production/3d/plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Creature-Sync Console", imageCount: 4, format: "glb" }),
    }),
    {} as never,
  );
  assert.equal(response.status, 200);
  const body = await response.json() as Record<string, any>;
  assert.equal(body.title, "Creature-Sync Console");
  assert.equal(body.executable, false);
  assert.equal(body.cost.verified, false);
});

test("Publisher refuses invalid reference counts", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/api/production/3d/preflight?imageCount=8"),
    {} as never,
  );
  assert.equal(response.status, 400);
});
