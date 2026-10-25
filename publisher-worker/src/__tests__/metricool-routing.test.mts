import test from "node:test";
import assert from "node:assert/strict";
import { metricoolCredentialsForBrand } from "../metricool-routing.ts";

const env = {
  COMPOSIO_API_KEY: "old-project-key", COMPOSIO_USER_ID: "old-user",
  METRICOOL_CONNECTED_ACCOUNT_ID: "old-account",
  Composio2: "blacklace-project-key", COMPOSIO2_USER_ID: "blacklace-user",
  COMPOSIO2_METRICOOL_CONNECTED_ACCOUNT_ID: "blacklace-account",
};
test("existing Pro.Hibited brand preserves all primary credentials", () => {
  assert.equal(metricoolCredentialsForBrand(env, "3350145"), env);
});
test("Blacklace uses its independent Composio project and account", () => {
  const selected = metricoolCredentialsForBrand(env, "7653100");
  assert.equal(selected.COMPOSIO_API_KEY, "blacklace-project-key");
  assert.equal(selected.COMPOSIO_USER_ID, "blacklace-user");
  assert.equal(selected.METRICOOL_CONNECTED_ACCOUNT_ID, "blacklace-account");
});
test("missing Blacklace secret never falls back to the primary API key", () => {
  const selected = metricoolCredentialsForBrand({ COMPOSIO_API_KEY: "old-project-key" }, "7653100");
  assert.equal(selected.COMPOSIO_API_KEY, undefined);
  assert.equal(selected.METRICOOL_CONNECTED_ACCOUNT_ID, undefined);
});
test("unknown brand cannot borrow either project's credentials", () => {
  assert.throws(() => metricoolCredentialsForBrand(env, "1234"), /METRICOOL_BRAND_NOT_ALLOWLISTED/);
});
