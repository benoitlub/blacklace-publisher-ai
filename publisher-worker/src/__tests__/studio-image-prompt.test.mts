import test from "node:test";
import assert from "node:assert/strict";
import module from "../worker.ts";
const app = "fetch" in module ? module : module.default;
test("image generation requires the parcel prompt and cannot default to a different product", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    throw new Error("No provider execution expected");
  });
  const r = await app.fetch(
    new Request("https://publisher.test/api/production/mistral-image/test"),
    {},
  );
  assert.equal(r.status, 400);
  assert.equal((await r.json()).status, "rejected");
  assert.equal(calls, 0);
});
