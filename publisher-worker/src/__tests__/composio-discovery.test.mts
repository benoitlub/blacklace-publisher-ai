import test from "node:test";
import assert from "node:assert/strict";
import {
  executeBusinessSearch,
  businessCandidates,
  validToolArguments,
  discoverBusinessTools,
  type DiscoveryDependencies,
} from "../composio-discovery.ts";
const schema = {
  type: "object",
  required: ["query"],
  additionalProperties: false,
  properties: { query: { type: "string", minLength: 2, maxLength: 1200 } },
};
function fixture(options: any = {}) {
  const rows = new Map<string, any>();
  const calls: any[] = [];
  const tool = {
    slug: options.slug ?? "DYNAMIC_WEB_SEARCH",
    name: "Web search",
    toolkit: { slug: options.toolkit ?? "composio_search" },
    input_parameters: options.schema ?? schema,
    ...options.tool,
  };
  const deps: DiscoveryDependencies = {
    userId: "gerard",
    request: async (path, init) => {
      calls.push({ path, init });
      if (path.includes("connected_accounts")) {
        assert.match(path, /user_ids=gerard/);
        if (options.error) throw options.error;
        return { items: options.accounts ?? [] };
      }
      if (path.startsWith("/tools?"))
        return options.paged && !path.includes("cursor=")
          ? { items: [], next_cursor: "second" }
          : { items: [tool] };
      if (path.startsWith("/tools/execute/")) {
        if (options.executeError) throw options.executeError;
        return (
          options.response ?? {
            successful: true,
            data: {
              citations: [
                {
                  title: "Société fixture",
                  id: "https://company.example.org/contact",
                  snippet: "Source simulée à qualifier",
                },
              ],
            },
          }
        );
      }
      throw new Error("Unexpected request");
    },
    store: async () => ({
      read: async (k) => rows.get(k) ?? null,
      claim: async (k, f) => {
        if (rows.has(k)) return false;
        rows.set(k, { fingerprint: f });
        return true;
      },
      finish: async (k, f, result) => {
        rows.set(k, { fingerprint: f, result });
      },
    }),
  };
  return {
    deps,
    calls,
    rows,
    writes: () => calls.filter((c) => c.path.includes("/execute/")),
  };
}
const input = {
  query: "Distributeurs B2B Europe",
  operationId: "business-read-1",
  dryRun: false,
  authorized: true,
};
test("discovers a changed slug on a later page, validates it and executes the discovered tool once", async () => {
  const f = fixture({ paged: true, slug: "RENAMED_WEB_RESEARCH" });
  const out = await executeBusinessSearch(input, f.deps);
  assert.equal(out.status, "sources-found");
  assert.equal(out.executed, true);
  assert.equal(out.verifiedProspects, 0);
  assert.equal(out.candidates[0].url, "https://company.example.org/contact");
  assert.equal(f.writes().length, 1);
  assert.match(f.writes()[0].path, /RENAMED_WEB_RESEARCH$/);
  const body = JSON.parse(f.writes()[0].init.body);
  assert.deepEqual(body.arguments, { query: input.query });
  assert.equal(body.user_id, "gerard");
  assert.ok(!body.connected_account_id);
  const repeat = await executeBusinessSearch(input, f.deps);
  assert.equal(repeat.replayed, true);
  assert.equal(f.writes().length, 1);
});
test("discovery, connection and execution are separate; preview creates no operation", async () => {
  const f = fixture();
  const tools = await discoverBusinessTools("web", f.deps);
  assert.equal(tools[0].connected, false);
  assert.equal(tools[0].authMode, "managed-platform-auth");
  const out = await executeBusinessSearch({ ...input, dryRun: true }, f.deps);
  assert.equal(out.status, "ready-to-read");
  assert.equal(out.executed, false);
  assert.equal(f.writes().length, 0);
  assert.equal(f.rows.size, 0);
});
test("authorization, unknown required arguments, destructive tool and inactive connection block execution", async () => {
  for (const options of [
    { authorized: false },
    { schema: { ...schema, required: ["query", "secret_key"] } },
    {
      tool: {
        description: "Create and send a message while searching the web",
      },
    },
    { toolkit: "external-search", accounts: [] },
  ]) {
    const f = fixture(options),
      out = await executeBusinessSearch(
        { ...input, authorized: options.authorized ?? true },
        f.deps,
      );
    assert.equal(out.executed, false);
    assert.equal(f.writes().length, 0);
  }
});
test("strict parameter validation rejects unknown schema keywords and invalid values", () => {
  for (const [value, s] of [
    [{ query: 5 }, schema],
    [{ query: "ok", extra: 1 }, schema],
    [{ query: "ok" }, { ...schema, $ref: "secret" }],
    [{ query: "x" }, schema],
  ])
    assert.equal(validToolArguments(value, s), false);
  assert.equal(validToolArguments({ query: "ok" }, schema), true);
});
test("HTTP 429 and authentication failures are explicit and never trigger fallback calls", async () => {
  for (const status of [401, 403, 429]) {
    const f = fixture({
      error: Object.assign(new Error("do not expose token"), {
        status,
        retryAfterSeconds: 90,
      }),
    });
    const out = await executeBusinessSearch(input, f.deps);
    assert.equal(out.providerHttpStatus, status);
    assert.equal(out.candidates.length, 0);
    assert.equal(f.writes().length, 0);
    assert.ok(!JSON.stringify(out).includes("token"));
    if (status === 429) assert.equal(out.retryAfterSeconds, 90);
  }
});
test("application errors and timeouts are not empty successful harvests; repeats stay reserved", async () => {
  for (const options of [
    { response: { successful: false, error: "provider rejected" } },
    { executeError: new Error("timeout after request") },
  ]) {
    const f = fixture(options);
    const out = await executeBusinessSearch(input, f.deps);
    assert.equal(out.status, "confirmation-required");
    assert.equal(out.executed, false);
    await executeBusinessSearch(input, f.deps);
    assert.equal(f.writes().length, 1);
  }
});
test("same operation with altered intent cannot execute a different query", async () => {
  const f = fixture();
  await executeBusinessSearch(input, f.deps);
  const changed = await executeBusinessSearch(
    { ...input, query: "Une autre recherche" },
    f.deps,
  );
  assert.equal(changed.reason, "OPERATION_CONTENT_CONFLICT");
  assert.equal(f.writes().length, 1);
});
test("concurrent identical reads spend at most one execution", async () => {
  const f = fixture();
  const outcomes = await Promise.all([
    executeBusinessSearch(input, f.deps),
    executeBusinessSearch(input, f.deps),
  ]);
  assert.equal(f.writes().length, 1);
  assert.ok(outcomes.some((r) => r.status === "sources-found"));
});
test("citations use URL/id/link, deduplicate and reject private or credentialed sources", () => {
  const rows = businessCandidates({
    data: {
      citations: [
        { title: "One", id: "https://example.org/a" },
        { title: "Duplicate", url: "https://example.org/a" },
        { title: "Private", url: "http://172.16.0.1/" },
        { title: "Credentials", url: "https://user:pass@example.org/" },
        { title: "Two", link: "https://example.net/" },
      ],
    },
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].verification, "search-result-only");
});
test("legitimate empty results remain an executed read with zero candidates", async () => {
  const f = fixture({
    response: { successful: true, data: { citations: [] } },
  });
  const out = await executeBusinessSearch(input, f.deps);
  assert.equal(out.status, "no-sources");
  assert.equal(out.executed, true);
  assert.equal(out.candidates.length, 0);
});

test("a connected external vendor is not authorization to consume an unverified paid quota", async () => {
  const f = fixture({
    toolkit: "external-search",
    accounts: [
      {
        id: "external",
        toolkit: { slug: "external_search" },
        status: "ACTIVE",
        user_id: "gerard",
      },
    ],
  });
  const out = await executeBusinessSearch(input, f.deps);
  assert.equal(out.reason, "READ_COST_POLICY_UNVERIFIED");
  assert.equal(f.writes().length, 0);
});

test("the existing Observatory inventory never advertises execution merely from active connection and tool text", async (t) => {
  const module = await import("../worker.ts");
  const worker =
    "fetch" in module.default ? module.default : module.default.default;
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const req = new Request(input, init);
    assert.equal(req.method, "GET");
    return Response.json(
      req.url.includes("connected_accounts")
        ? {
            items: [
              {
                id: "canva-fixture",
                toolkit: { slug: "canva" },
                user_id: "gerard",
                status: "ACTIVE",
              },
            ],
          }
        : {
            items: [
              {
                slug: "CANVA_FIXTURE_IMAGE",
                name: "Generate image",
                description: "Generate an image from text",
                toolkit: { slug: "canva" },
                input_parameters: {
                  type: "object",
                  properties: { prompt: { type: "string" } },
                },
              },
            ],
          },
    );
  });
  const response = await worker.fetch(
    new Request(
      "https://publisher.test/api/observatory/tool-packs?capability=visual.generate",
    ),
    { COMPOSIO_API_KEY: "simulated", COMPOSIO_USER_ID: "gerard" },
  );
  const data = await response.json();
  assert.equal(data.packs.length, 1);
  assert.equal(data.packs[0].connectionActive, true);
  assert.equal(data.packs[0].executable, false);
  assert.equal(data.packs[0].executionVerified, false);
});
