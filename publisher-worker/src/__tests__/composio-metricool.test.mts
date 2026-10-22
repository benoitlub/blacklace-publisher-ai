import test from "node:test";
import assert from "node:assert/strict";
import { discoverComposioAccounts } from "../composio-accounts.ts";
import { createMetricoolProvider } from "../metricool-composio.ts";
import { metricoolToolFixtures, metricoolAccount, simulatedBrand, toolOperation, envelope } from "./fixtures/metricool-fixture.mts";

test("account discovery traverses unrelated first pages, preserves user scope and parses custom MCP slugs", async () => {
  const calls: URL[] = [];
  const accounts = await discoverComposioAccounts("gerard-user", async path => {
    const url = new URL(path, "https://composio.test"); calls.push(url);
    assert.equal(url.searchParams.get("user_ids"), "gerard-user");
    return url.searchParams.has("cursor")
      ? { items: [ { id: "metricool", toolkit: { slug: "metricool_mcp" }, status: " ACTIVE ", user_id: "gerard-user" }, { id: "foreign", toolkit: { slug: "metricool" }, status: "ACTIVE", user_id: "different-user" } ] }
      : { items: [{ id: "canva", toolkit: { slug: "canva" }, status: "ACTIVE" }], next_cursor: "next page" };
  });
  assert.equal(calls.length, 2); assert.deepEqual(accounts.map(a => a.id), ["canva", "metricool"]);
  assert.equal(accounts[1].toolkitSlug, "metricool-mcp");
});
test("empty scoped accounts never widen to all users; 429/401/5xx never retry variants", async () => {
  let calls = 0;
  assert.deepEqual(await discoverComposioAccounts("id", async () => { calls++; return { items: [] }; }), []);
  assert.equal(calls, 1);
  for (const status of [401, 429, 500]) {
    calls = 0;
    await assert.rejects(discoverComposioAccounts("id", async () => { calls++; throw Object.assign(new Error("safe fake error"), { status }); }));
    assert.equal(calls, 1);
  }
});
test("only a route/schema error permits singular scoped fallback; pagination loops fail", async () => {
  const paths: string[] = [];
  await discoverComposioAccounts("id", async path => { paths.push(path); if (path.includes("user_ids=")) throw Object.assign(new Error(), { status: 422 }); return { items: [] }; });
  assert.equal(paths.length, 2); assert.ok(paths[1].includes("user_id=id"));
  await assert.rejects(discoverComposioAccounts("id", async () => ({ items: [], next_cursor: "same" })), /PAGINATION_LOOP/);
});
function deps(execute: (input: any) => Promise<unknown> = async () => envelope([])) {
  return { accounts: async () => [metricoolAccount], tools: async () => metricoolToolFixtures(), execute, brandId: "3350145" };
}
test("account mismatch, inactive and ambiguous Metricool accounts have distinct safe diagnoses", async () => {
  for (const [accounts, code] of [
    [[{ ...metricoolAccount, toolkitSlug: "canva" }], "NOT_FOUND_FOR_USER"],
    [[{ ...metricoolAccount, status: "EXPIRED" }], "INACTIVE_OR_WRONG_ID"],
    [[metricoolAccount, { ...metricoolAccount, id: "two" }], "AMBIGUOUS"],
  ] as const) await assert.rejects(createMetricoolProvider({ ...deps(), accounts: async () => [...accounts] }), new RegExp(code));
});
test("uses the discovered account and exact tool schema, including MCP JSON content envelopes", async () => {
  const p = await createMetricoolProvider(deps(async input => {
    assert.equal(input.connectedAccountId, metricoolAccount.id);
    if (toolOperation(input.toolSlug) === "get_brands") return envelope([simulatedBrand]);
    assert.equal(input.arguments.timezone, "Europe%2FMadrid");
    return envelope({ data: [{ dayOfWeek: 6, hour: 12, value: 90 }] });
  }));
  assert.equal((await p.brand()).id, "3350145");
  assert.deepEqual(await p.bestTimes("2026-10-22", "2026-10-28", "facebook", "Europe/Madrid"), [{ dayOfWeek: 6, hour: 12, value: 90 }]);
});
test("brand-wide published reads cover stories/reels/posts on every connected network", async () => {
  const names: string[] = [];
  const p = await createMetricoolProvider(deps(async ({ toolSlug }) => { names.push(toolOperation(toolSlug)); return envelope([]); }));
  await p.published("2026-10-01", "2026-10-31", ["facebook", "instagram"]);
  assert.equal(names.length, 6); assert.ok(names.includes("get_instagram_stories")); assert.ok(names.includes("get_facebook_reels"));
});
test("missing history/schema, unsupported brand networks and incomplete pages fail closed", async () => {
  let p = await createMetricoolProvider({ ...deps(), tools: async () => [] });
  await assert.rejects(p.brand(), /TOOL_SCHEMA_UNAVAILABLE/);
  p = await createMetricoolProvider(deps(async () => envelope([{ ...simulatedBrand, networks: ["facebook", "threads"] }])));
  await assert.rejects(p.brand(), /QUOTA_COVERAGE_UNSUPPORTED/);
  p = await createMetricoolProvider(deps(async () => envelope({ items: [], total: 20 })));
  await assert.rejects(p.scheduled("2026-10-01", "2026-10-31", "Europe/Madrid"), /INCOMPLETE/);
});
test("tool application errors, invalid JSON and malformed post status are not successful empty histories", async () => {
  for (const payload of [{ successful: false, error: "failure" }, { successful: true, data: "not JSON" }, envelope({ data: [{ id: "id-only" }] })]) {
    const p = await createMetricoolProvider(deps(async () => payload));
    await assert.rejects(p.scheduled("2026-10-01", "2026-10-31", "Europe/Madrid"));
  }
});
test("rate limits/auth failures retain a safe diagnosis without exposing provider error text", async () => {
  for (const status of [401, 403, 429]) {
    await assert.rejects(createMetricoolProvider({ ...deps(), accounts: async () => { throw Object.assign(new Error("secret-like-provider-detail"), { status }); } }), error => {
      assert.ok(!String(error).includes("secret-like-provider-detail"));
      assert.match(String(error), status === 429 ? /COMPOSIO_RATE_LIMITED/ : /COMPOSIO_AUTHORIZATION_FAILED/);
      return true;
    });
  }
});
test("partial provider failure cannot be treated as zero quota usage or successful scheduling", async () => {
  const p = await createMetricoolProvider(deps(async () => envelope({ data: [{ id: "mixed", text: "Test", media: [], date: "2026-10-24T12:00:00", status: "scheduled",
    providers: [{ network: "facebook", status: "published" }, { network: "instagram", status: "failed" }] }] })));
  await assert.rejects(p.scheduled("2026-10-01", "2026-10-31", "Europe/Madrid"), /PARTIAL_PROVIDER_FAILURE/);
});
test("UTC publication timestamps are converted to the brand's month", async () => {
  const p = await createMetricoolProvider(deps(async () => envelope({ data: [{ id: "boundary", text: "Test", media: [], date: "2026-10-31T23:30:00Z", status: "scheduled", providers: [{ network: "facebook" }] }] })));
  assert.equal((await p.scheduled("2026-10-01", "2026-11-01", "Europe/Madrid"))[0].date, "2026-11-01T00:30:00");
});
test("exhausts provider pagination and does not trust the first page's smaller usage", async () => {
  let calls = 0;
  const fixtures = metricoolToolFixtures();
  const tool = fixtures.find(t => t.name === "get_scheduled_posts")!;
  tool.inputSchema.properties.cursor = { type: "string" };
  const p = await createMetricoolProvider({ ...deps(async ({ arguments: args }) => { calls++; return envelope(args.cursor ? { items: [], total: 1 } : { items: [{ id: "one", text: "Other", media: [], date: "2026-10-24T12:00:00", status: "scheduled", providers: [{ network: "facebook" }] }], next_cursor: "second", total: 1 }); }), tools: async () => fixtures });
  assert.equal((await p.scheduled("2026-10-01", "2026-10-31", "Europe/Madrid")).length, 1);
  assert.equal(calls, 2);
});
