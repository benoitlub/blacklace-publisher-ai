import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import workerModule, { isHarvestAllowedForSocialSelection } from "../worker";

// tsx loads worker.ts as CommonJS in this package; support its ESM interop.
const worker = "fetch" in workerModule ? workerModule : workerModule.default;

const rows = [
  { id: "420-old", seed_id: "420-dice" },
  { id: "420-new", seed_id: "420-dice" },
  { id: "feuch-1", seed_id: "feuch-dice" },
  { id: "terra-1", seed_id: "terra" },
];

test("excluding a seed excludes ALL its harvests, including new IDs", () => {
  const eligible = rows.filter(row => isHarvestAllowedForSocialSelection(
    row, new Set<string>(), new Set(["420-dice"]),
  ));
  assert.deepEqual(eligible.map(row => row.id), ["feuch-1", "terra-1"]);
});

test("excluding one harvest does not exclude its entire seed", () => {
  const eligible = rows.filter(row => isHarvestAllowedForSocialSelection(
    row, new Set(["420-old"]), new Set<string>(),
  ));
  assert.deepEqual(eligible.map(row => row.id), ["420-new", "feuch-1", "terra-1"]);
});

test("seed and harvest exclusions combine independently", () => {
  const eligible = rows.filter(row => isHarvestAllowedForSocialSelection(
    row, new Set(["feuch-1"]), new Set(["420-dice"]),
  ));
  assert.deepEqual(eligible.map(row => row.id), ["terra-1"]);
});

test("without exclusions, every harvest stays eligible at this stage", () => {
  assert.deepEqual(
    rows.filter(row => isHarvestAllowedForSocialSelection(row, new Set(), new Set())),
    rows,
  );
});

// Exercise the actual HTTP handler, query parsing and ranking. Only Neon's
// fetch boundary is stubbed; no database, AI or publishing service is contacted.
function harvest(id: string, seed_id: string | null, created_at = "2026-10-20") {
  return {
    id, seed_id, parcel_id: "creative", title: `Campagne ${id}`,
    content: `Accroche centrale: Découvrez ${id}.`,
    url: "https://example.org/visual.png", download_url: null, type: "social",
    status: "ready", created_at, synced_at: created_at,
  };
}

async function select(t: TestContext, query: string, fixtures = [
  harvest("420-new", "420-dice", "2026-10-21"),
  harvest("420-old", "420-dice"),
  harvest("feuch-1", "feuch-dice", "2026-10-19"),
  harvest("other-1", "other", "2026-10-18"),
]) {
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(String(url), "https://api.invalid/sql", "unexpected external request");
    const { query: sql } = JSON.parse(String(init?.body));
    calls.push(sql);
    const selected = /SELECT \*/.test(sql) ? fixtures : [];
    assert.match(sql, /CREATE (?:TABLE|INDEX) IF NOT EXISTS|SELECT \*/);
    const columns = selected.length ? Object.keys(selected[0]) : [];
    return Response.json({
      fields: columns.map(name => ({ name, dataTypeID: 25 })),
      rows: selected.map(row => columns.map(key => row[key])),
      rowCount: selected.length,
    });
  });
  const response = await worker.fetch(new Request(`https://publisher.invalid/api/social/bridge/next?${query}`), {
    DATABASE_URL: "postgresql://audit:audit@audit.invalid/audit",
  });
  const body = await response.json();
  assert.ok(calls.some(sql => /SELECT \*/.test(sql)), `must exercise real harvest loading: ${JSON.stringify(body)}`);
  if (body.status === "ready") {
    assert.equal(body.metricool.autoPublish, false);
    assert.equal(body.metricool.draft, true);
  } else {
    assert.equal(body.guardrails.autoPublish, false);
  }
  return { response, body };
}

test("HTTP: excludes every harvest of a seed before choosing the top candidate", async t => {
  const { response, body } = await select(t, "excludeSeedIds=420-dice");
  assert.equal(response.status, 200);
  assert.equal(body.harvestId, "feuch-1");
  assert.equal(body.seedId, "feuch-dice");
  assert.equal(body.production.generated, false);
});

test("HTTP: parses whitespace, empty entries and combined seed/harvest exclusions", async t => {
  const query = new URLSearchParams({ excludeSeedIds: " , 420-dice, other, ", excludeHarvestIds: " feuch-1, " });
  const { response, body } = await select(t, query.toString());
  assert.equal(response.status, 404);
  assert.equal(body.status, "empty");
});

test("HTTP: excluding an individual harvest still allows another from that seed", async t => {
  const { body } = await select(t, "excludeHarvestIds=420-new");
  assert.equal(body.harvestId, "420-old");
});

test("HTTP: Gerard's explicit eligible harvest overrides the ranking", async t => {
  const { body } = await select(t, "harvestId=other-1");
  assert.equal(body.harvestId, "other-1");
});

test("HTTP: a pinned excluded harvest never falls back to another candidate", async t => {
  const { response, body } = await select(t, "harvestId=420-new&excludeSeedIds=420-dice");
  assert.equal(response.status, 404);
  assert.equal(body.status, "empty");
});

test("HTTP: an unknown requested harvest is not silently replaced", async t => {
  const { response, body } = await select(t, "harvestId=missing");
  assert.equal(response.status, 404);
  assert.equal(body.status, "empty");
});

test("HTTP: private and non-editorial harvests remain ineligible", async t => {
  const { response, body } = await select(t, "", [
    harvest("private-seed", "yael-prospection"),
    { ...harvest("private-parcel", "other"), parcel_id: "project-yael-prospection" },
    { ...harvest("internal", "other"), content: "Journal de bord autonome. Accroche centrale: interne." },
  ]);
  assert.equal(response.status, 404);
  assert.equal(body.status, "empty");
});

test("HTTP: a missing seed is not excluded by an empty query entry", async t => {
  const { body } = await select(t, "excludeSeedIds=,%20,420-dice", [harvest("legacy", null)]);
  assert.equal(body.harvestId, "legacy");
});
