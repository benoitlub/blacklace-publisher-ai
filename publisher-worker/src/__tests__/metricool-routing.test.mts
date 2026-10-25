import test from "node:test";
import assert from "node:assert/strict";
import { metricoolCredentialsForBrand } from "../metricool-routing.ts";

const env = {
  COMPOSIO_API_KEY: "existing-project-key", COMPOSIO_USER_ID: "gerard",
  METRICOOL_CONNECTED_ACCOUNT_ID: "prohibited-connected",
  METRICOOL_BLACKLACE_CONNECTED_ACCOUNT_ID: "blacklace-connected",
};
test("Pro.Hibited preserves its existing Composio credentials and connection", () => {
  assert.equal(metricoolCredentialsForBrand(env, "3350145"), env);
});
test("Blacklace reuses the Composio key/user but selects only its own connected account", () => {
  const selected = metricoolCredentialsForBrand(env, "7653100");
  assert.equal(selected.COMPOSIO_API_KEY, "existing-project-key");
  assert.equal(selected.COMPOSIO_USER_ID, "gerard");
  assert.equal(selected.METRICOOL_CONNECTED_ACCOUNT_ID, "blacklace-connected");
});
test("Blacklace is blocked until a second connected account is explicitly configured", () => {
  assert.throws(() => metricoolCredentialsForBrand({ COMPOSIO_API_KEY: "existing-project-key" }, "7653100"), /BLACKLACE_METRICOOL_ACCOUNT_NOT_CONFIGURED/);
});
test("one account cannot be accidentally used for both brands", () => {
  assert.throws(() => metricoolCredentialsForBrand({ ...env, METRICOOL_BLACKLACE_CONNECTED_ACCOUNT_ID: "prohibited-connected" }, "7653100"), /METRICOOL_ACCOUNT_DESTINATION_COLLISION/);
});
test("unknown brand cannot borrow either account", () => {
  assert.throws(() => metricoolCredentialsForBrand(env, "1234"), /METRICOOL_BRAND_NOT_ALLOWLISTED/);
});
