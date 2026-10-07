import test from "node:test";
import assert from "node:assert/strict";
import { evaluateInnovationCandidate } from "../worker.ts";

const tool = (slug, description, toolkitSlug = "lab") => ({
  slug, name: slug, description, toolkitSlug, inputSchema: null,
});

test("Atelier rejects destructive external capabilities", () => {
  const result = evaluateInnovationCandidate(tool("DELETE_PAYMENT", "Delete payment purchase records"), true);
  assert.equal(result.verdict, "reject");
  assert.equal(result.execution, "disabled");
});

test("Atelier promotes only high-value capabilities already connected", () => {
  const result = evaluateInnovationCandidate(tool("RESEARCH_AUTOMATION", "Search research monitor trends with workflow automation"), true);
  assert.equal(result.verdict, "promote-candidate");
  assert.equal(result.execution, "disabled");
});

test("Atelier keeps useful unconnected discoveries in sandbox", () => {
  const result = evaluateInnovationCandidate(tool("VIDEO_GENERATE", "Generate video animation and audio"), false);
  assert.equal(result.verdict, "sandbox-candidate");
  assert.equal(result.execution, "disabled");
});
