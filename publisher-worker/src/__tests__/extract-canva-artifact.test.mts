// Regression guard for the Canva log_id bug (fixed in commit 859d2ac2):
// Composio wraps every tool call as { data, successful, error, log_id }.
// log_id is Composio's own execution-trace id, unrelated to Canva, but a
// looser id-matching regex used to pick it up as if it were the design id
// whenever the call failed — producing links like
// canva.com/design/log_XXXX/edit that 404 on Canva's side.
//
// Run with: node --experimental-strip-types --test src/__tests__/extract-canva-artifact.test.mts
// (no test framework exists in this package; this uses Node's built-in
// test runner + native TS stripping rather than adding one, per the
// "don't build a parallel test infra" instruction this was written under.)

import { test } from "node:test";
import assert from "node:assert/strict";
import { extractCanvaArtifact } from "../worker.ts";

test("a failed Composio call (successful:false) never produces an artifact, even with a log_id present", () => {
  const failedResponse = {
    data: {
      http_error: "400 Client Error: Bad Request for url: https://api.canva.com/rest/v1/designs",
      message: "{\"code\":\"invalid_field\",\"message\":\"One of 'design_type' or 'asset_id' must be defined.\"}",
      status_code: 400,
    },
    successful: false,
    error: "{\"code\":\"invalid_field\",\"message\":\"One of 'design_type' or 'asset_id' must be defined.\"}",
    log_id: "log_e9vohjnxgnOy",
  };
  const artifact = extractCanvaArtifact(failedResponse, "Test seed");
  assert.equal(artifact, null, "a failed Composio response must never yield an artifact/url");
});

test("a bare log_id-shaped key is never mistaken for a design id, even on a successful response", () => {
  // Same envelope shape but successful:true, with no real design fields —
  // only Composio's own log_id. Should still yield nothing, because the
  // id-matching regex requires literal 'design' in the key name.
  const responseWithOnlyLogId = {
    data: { some_field: "value" },
    successful: true,
    error: null,
    log_id: "log_7Ebx-uF7OBwi",
  };
  const artifact = extractCanvaArtifact(responseWithOnlyLogId, "Test seed");
  assert.equal(artifact, null, "log_id must never be picked up as a design id/url");
});

test("a real design id/url on a successful response is extracted correctly", () => {
  const realSuccessResponse = {
    data: {
      design_id: "DAGxxxREAL123",
      urls: { edit_url: "https://www.canva.com/design/DAGxxxREAL123/edit" },
    },
    successful: true,
    error: null,
    log_id: "log_unrelated_trace_id",
  };
  const artifact = extractCanvaArtifact(realSuccessResponse, "Test seed");
  assert.ok(artifact, "a genuine successful response must yield an artifact");
  assert.equal(artifact?.url, "https://www.canva.com/design/DAGxxxREAL123/edit");
  assert.ok(!artifact?.url?.includes("log_"), "the extracted url must never be built from log_id");
});
