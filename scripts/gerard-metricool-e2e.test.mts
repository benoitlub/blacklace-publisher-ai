// Run after the workspace install and publisher-worker npm ci:
// pnpm --filter @workspace/scripts exec tsx --test ./gerard-metricool-e2e.test.mts
// Optional GERARD_CLIENT_PATH points to Poulpe's actual client for the local
// cross-repository proof; CI replays its generated, versioned mission fixture.
import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import workerModule from "../publisher-worker/src/worker.ts";
import { metricoolToolFixtures, simulatedBrand, toolOperation, envelope } from "../publisher-worker/src/__tests__/fixtures/metricool-fixture.mts";

for (const withMedia of [false, true]) test(`real Gerard -> Octopus -> Publisher -> simulated Composio/Metricool (${withMedia ? "Facebook + Instagram image" : "Facebook text"}) -> status`, async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-22T12:00:00Z") });
  const worker = "fetch" in workerModule ? workerModule : workerModule.default;
  const fixtures = JSON.parse(await readFile(new URL("../publisher-worker/src/__tests__/fixtures/gerard-metricool-mission.json", import.meta.url), "utf8"));
  const fixture = withMedia ? fixtures.mediaCase : fixtures;
  const { app: octopus } = await import(new URL("../artifacts/api-server/node_modules/octopus-engine/dist/app.js", import.meta.url).href);
  const workerEnv = { DATABASE_URL: "postgresql://simulation:simulation@simulation.invalid/simulation", COMPOSIO_API_KEY: "simulated-api-key",
    COMPOSIO_USER_ID: "gerard-simulated-user", METRICOOL_EXECUTION_TOKEN: "simulated-execution-token", METRICOOL_PUBLISHING_ENABLED: "true" };
  const previousEnv = { DATABASE_URL: process.env.DATABASE_URL, PUBLISHER_URL: process.env.PUBLISHER_URL, METRICOOL_EXECUTION_TOKEN: process.env.METRICOOL_EXECUTION_TOKEN };
  process.env.DATABASE_URL = workerEnv.DATABASE_URL;
  process.env.PUBLISHER_URL = "https://publisher.test";
  process.env.METRICOOL_EXECUTION_TOKEN = workerEnv.METRICOOL_EXECUTION_TOKEN;
  t.after(() => { for (const [key, value] of Object.entries(previousEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  let apiAdapter: any;
  let state: any = null;
  let posts: any[] = [];
  let writes = 0;
  let historyRead = 0;
  let mediaReads = 0;
  const trace: string[] = [];
  const harvest = { id: fixture.candidate.harvestId, parcel_id: "games", seed_id: "feuch-dice", title: "Jeu Feuch Dice", content: `Accroche centrale: ${fixture.candidate.copy.text}`, url: fixture.candidate.media?.url ?? null, download_url: null, type: "social", status: "ready", created_at: "2026-10-22T12:00:00", synced_at: "2026-10-22T12:00:00" };
  function sqlResponse(rows: Record<string, unknown>[]) {
    const columns = rows.length ? Object.keys(rows[0]) : [];
    return Response.json({ fields: columns.map(name => ({ name, dataTypeID: typeof rows[0][name] === "object" ? 3802 : 25 })),
      rows: rows.map(row => columns.map(name => typeof row[name] === "object" && row[name] !== null ? JSON.stringify(row[name]) : row[name])), rowCount: rows.length });
  }
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const url = new URL(req.url);
    if (url.origin === "https://octopus.test") {
      trace.push(`octopus:${url.pathname}`); return octopus.fetch(req);
    }
    if (url.origin === "https://publisher-adapter.test") {
      trace.push("publisher-local:adapter");
      return Response.json(await apiAdapter.executePublisherAdapter(await req.json()));
    }
    if (url.origin === "https://publisher.test") {
      trace.push(`worker:${url.pathname}`);
      assert.equal(req.headers.get("Authorization"), "Bearer simulated-execution-token");
      return worker.fetch(req, workerEnv);
    }
    if (url.href === "https://api.invalid/sql") {
      const { query, params } = await req.json() as any;
      if (/CREATE (TABLE|INDEX)/.test(query)) return sqlResponse([]);
      if (/SELECT \* FROM garden_harvests/.test(query)) return sqlResponse([harvest]);
      if (/SELECT value, version FROM publisher_global_state/.test(query)) return sqlResponse(state ? [{ value: state.value, version: state.version }] : []);
      if (/INSERT INTO publisher_global_state/.test(query)) {
        if (state) return sqlResponse([]);
        state = { value: JSON.parse(params[1]), version: 1 }; return sqlResponse([{ version: 1 }]);
      }
      if (/UPDATE publisher_global_state SET value/.test(query)) {
        if (state?.version !== Number(params[2])) return sqlResponse([]);
        state = { value: JSON.parse(params[0]), version: state.version + 1 }; return sqlResponse([{ version: state.version }]);
      }
      throw new Error("Unexpected SQL in simulation");
    }
    if (url.href === "https://example.org/feuch.png") {
      assert.equal(req.method, "HEAD"); mediaReads++;
      return new Response(null, { headers: { "Content-Type": "image/png" } });
    }
    if (url.origin === "https://backend.composio.dev") {
      if (url.pathname.endsWith("/connected_accounts")) {
        assert.equal(url.searchParams.get("user_ids"), "gerard-simulated-user");
        return Response.json(url.searchParams.has("cursor") ? { items: [{ id: "metricool-simulated", toolkit: { slug: "metricool_mcp" }, status: "ACTIVE", user_id: "gerard-simulated-user" }] }
          : { items: [{ id: "unrelated-canva", toolkit: { slug: "canva" }, status: "ACTIVE" }], next_cursor: "metricool-on-second-page" });
      }
      if (url.pathname.endsWith("/tools")) return Response.json({ items: metricoolToolFixtures().map(({ inputSchema, ...tool }) => ({ ...tool, input_parameters: inputSchema })) });
      const slug = decodeURIComponent(url.pathname.split("/").pop()!);
      const operation = toolOperation(slug);
      const body = await req.json() as any;
      assert.equal(body.connected_account_id, "metricool-simulated");
      const args = body.arguments;
      trace.push(`composio:${operation}`);
      if (operation === "get_brands") return Response.json(envelope([simulatedBrand]));
      if (operation === "get_scheduled_posts") return Response.json(envelope({ data: posts }));
      if (operation === "get_best_time_to_post") return Response.json(envelope({ data: Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i + 1, hour: 12, value: 90 - i })) }));
      if (/^get_(facebook|instagram)_(posts|reels|stories)$/.test(operation)) { historyRead++; return Response.json(envelope({ data: [] })); }
      if (operation === "post_schedule_post") {
        writes++;
        assert.equal(state?.value.reservations.length, 1, "reservation must precede external write");
        assert.ok(historyRead >= 6, "quota must include every connected network/format");
        assert.equal(args.info.autoPublish, true); assert.equal(args.info.draft, false);
        posts = [{ id: "simulated-post-42", text: args.info.text, media: args.info.media, providers: args.info.providers,
          publicationDate: args.info.publicationDate, status: "scheduled", autoPublish: true, draft: false }];
        return Response.json(envelope({ data: { id: "simulated-post-42" } }));
      }
    }
    throw new Error(`Real/unexpected network forbidden in simulation: ${url.origin}${url.pathname}`);
  });
  // Import after establishing the network guard. The database pool is lazy;
  // only the Worker's simulated Neon transport is used by this capability.
  apiAdapter = await import("../artifacts/api-server/src/publisher/octopus-adapter.ts");
  const registered = await octopus.request("/adapters/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    id: "publisher", name: "Publisher", capabilities: ["social.publish"], executeUrl: "https://publisher-adapter.test/api/octopus-adapter/execute",
  }) });
  assert.equal(registered.status, 201);
  let missionId: string;
  if (process.env.GERARD_CLIENT_PATH) {
    const gerard = await import(pathToFileURL(process.env.GERARD_CLIENT_PATH).href);
    assert.deepEqual(gerard.metricoolMission(fixture.candidate, { execute: true, now: new Date("2026-10-22T12:00:00Z") }), fixture.mission);
    const candidate = await gerard.submitMetricoolPublication(fixture.candidate, { execute: true, octopusUrl: "https://octopus.test" });
    assert.equal(candidate.metricoolHandoff.status, "confirmed-scheduled", JSON.stringify(candidate.metricoolHandoff)); assert.equal(candidate.metricoolHandoff.postId, "simulated-post-42");
    missionId = candidate.metricoolHandoff.missionId;
    await gerard.submitMetricoolPublication(fixture.candidate, { execute: true, octopusUrl: "https://octopus.test", now: new Date(Date.now() + 1) });
  } else {
    const response = await fetch("https://octopus.test/mission", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fixture.mission) });
    const body = await response.json() as any;
    assert.equal(body.status, "completed", JSON.stringify(body)); assert.equal(body.output.scheduled, true); assert.equal(body.output.postId, "simulated-post-42");
    missionId = body.missionId;
    await fetch("https://octopus.test/mission", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...fixture.mission, operationId: fixture.mission.operationId + "-check" }) });
  }
  assert.equal(writes, 1, "status checks must never schedule again");
  assert.equal(mediaReads, withMedia ? 1 : 0);
  assert.equal(state.value.reservations[0].state, "scheduled");
  const status = await (await octopus.request(`/missions/${missionId}`)).json() as any;
  assert.equal(status.status, "completed");
  assert.ok(trace.includes("publisher-local:adapter")); assert.ok(trace.includes("worker:/api/social/publication/finalize"));
  console.log(JSON.stringify({ proof: "gerard-octopus-publisher-composio-metricool", gerardClient: process.env.GERARD_CLIENT_PATH ? "actual-poulpe-client" : "versioned-mission-fixture", octopus: "existing-pinned-engine", writes: "1 simulated, 0 real", quotaReaders: historyRead, mediaValidated: withMedia, networks: fixture.candidate.compatibleNetworks, providerPostId: "simulated-post-42", state: "confirmed-scheduled", repeatedRequestWrites: 0, trace }));
});
