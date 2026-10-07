import test from "node:test";
import assert from "node:assert/strict";
import { innovationScore } from "../worker.ts";

function tool(slug, description) {
  return { slug, name: slug, description, toolkitSlug: "test", inputSchema: null };
}

test("Innovation Radar favors research and monitoring capabilities", () => {
  assert.ok(innovationScore(tool("WEB_RESEARCH", "Search the web, monitor trends and research news")) >= 4);
});

test("Innovation Radar favors generative creative capabilities", () => {
  assert.ok(innovationScore(tool("VIDEO_GENERATE", "Generate video animation and audio")) >= 4);
});

test("Innovation Radar recognizes publishing automation", () => {
  assert.ok(innovationScore(tool("SOCIAL_SCHEDULE", "Schedule and publish social content with workflow automation")) >= 6);
});

test("Innovation Radar penalizes deprecated or destructive commerce tools", () => {
  assert.ok(innovationScore(tool("DELETE_PURCHASE", "Deprecated payment purchase and delete action")) < 3);
});
