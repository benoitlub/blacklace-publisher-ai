import test from "node:test";
import assert from "node:assert/strict";
import { executeMetricoolPublication, wallClockInstant, verifiedBudget, monthWindow, type Publication, type MetricoolProvider, type PublicationStore, type PublicationState } from "../metricool-publication.ts";

const input: Publication = { operationId: "gerard-op", harvestId: "harvest-1", text: "Une décision de Gérard.",
  media: [], networks: ["facebook"], brandId: "3350145", timezone: "Europe/Madrid" };
function harness(overrides: Partial<MetricoolProvider> = {}) {
  let state: PublicationState = { version: 0, reservations: [] };
  let writes = 0;
  let posted: any[] = [];
  const store: PublicationStore = {
    async read() { return structuredClone(state); },
    async compareAndSet(version, reservations) {
      if (version !== state.version) return false;
      state = { version: version + 1, reservations: structuredClone(reservations) }; return true;
    },
  };
  const provider: MetricoolProvider = {
    async brand() { return { id: "3350145", label: "pro.hbtd", timezone: "Europe/Madrid", networks: ["facebook", "instagram"] }; },
    async published() { return []; },
    async scheduled() { return posted; },
    async bestTimes() { return [{ dayOfWeek: 6, hour: 12, value: 100 }, { dayOfWeek: 7, hour: 12, value: 90 }]; },
    async schedule(date, info) {
      writes++; posted = [{ id: "post-42", date, text: info.text, media: info.media, networks: (info.providers as any[]).map(p => p.network), status: "scheduled" }];
      return "post-42";
    }, ...overrides,
  };
  const deps = { provider, store, verifyMedia: async () => "image/png", now: new Date("2026-10-22T12:00:00Z"), dryRun: false, enabled: true, authorized: true };
  return { deps, state: () => state, writes: () => writes, posted: () => posted };
}

test("schedules exactly once and confirms provider ID, content, networks and time", async () => {
  const h = harness();
  const r = await executeMetricoolPublication(input, h.deps);
  assert.equal(r.status, "confirmed-scheduled"); assert.equal(r.scheduled, true); assert.equal(r.published, false);
  assert.equal(r.postId, "post-42"); assert.equal(r.publicationDate, "2026-10-23T12:00:00");
  assert.equal(h.writes(), 1);
  assert.equal((await executeMetricoolPublication(input, h.deps)).postId, "post-42");
  assert.equal(h.writes(), 1);
});
test("dry-run verifies budget/time without a write or a reservation", async () => {
  const h = harness(); const r = await executeMetricoolPublication(input, { ...h.deps, dryRun: true, enabled: false, authorized: false });
  assert.equal(r.status, "ready-to-schedule"); assert.equal(r.scheduled, false); assert.equal(r.budget?.verified, true);
  assert.equal(h.writes(), 0); assert.equal(h.state().version, 0);
});
test("disabled and unauthenticated execution stop before any provider read", async () => {
  for (const extra of [{ enabled: false }, { authorized: false }]) {
    const h = harness({ brand: async () => { throw new Error("must not run"); } });
    assert.equal((await executeMetricoolPublication(input, { ...h.deps, ...extra })).reason, "METRICOOL_EXECUTION_DISABLED_OR_UNAUTHORIZED");
    assert.equal(h.writes(), 0);
  }
});
test("quota includes every published brand network, queued units and local pending reservations", async () => {
  const h = harness({ published: async (_start, _end, networks) => {
    assert.deepEqual(networks, ["facebook", "instagram"]);
    return Array.from({ length: 19 }, (_, n) => ({ id: String(n), text: "Autre", media: [], networks: [n % 2 ? "instagram" : "facebook"], date: "2026-10-01T12:00:00", status: "published" as const }));
  } });
  const r = await executeMetricoolPublication({ ...input, networks: ["facebook", "instagram"], media: ["https://example.org/image.png"] }, h.deps);
  assert.equal(r.status, "quota-exhausted"); assert.equal(r.budget?.projectedUsed, 21); assert.equal(h.writes(), 0);
});
test("an unknown quota/read failure never becomes zero usage", async () => {
  const h = harness({ published: async () => { throw new Error("incomplete history"); } });
  assert.equal((await executeMetricoolPublication(input, h.deps)).scheduled, false); assert.equal(h.writes(), 0);
  for (const used of [NaN, -1, Infinity]) assert.throws(() => verifiedBudget(used, 0, ["facebook"]));
});
test("provider duplicates and local duplicates from another harvest block writes", async () => {
  const h = harness(); await executeMetricoolPublication(input, h.deps);
  const r = await executeMetricoolPublication({ ...input, operationId: "another-op", harvestId: "other-harvest" }, h.deps);
  assert.equal(r.reason, "LOCAL_DUPLICATE_OR_UNCERTAIN_REQUEST"); assert.equal(h.writes(), 1);
  const p = harness({ published: async () => [{ id: "already", date: "2026-10-20T12:00:00", text: input.text, media: [], networks: ["facebook"], status: "published" }] });
  assert.equal((await executeMetricoolPublication(input, p.deps)).reason, "PROVIDER_DUPLICATE"); assert.equal(p.writes(), 0);
});
test("a timeout reserves the request permanently until a provider read reconciles it", async () => {
  let writes = 0;
  const h = harness({ schedule: async () => { writes++; throw new Error("timeout after provider write"); } });
  const first = await executeMetricoolPublication(input, h.deps);
  assert.equal(first.status, "confirmation-required"); assert.equal(h.state().reservations[0].state, "unknown");
  assert.equal((await executeMetricoolPublication(input, h.deps)).status, "confirmation-required"); assert.equal(writes, 1);
});
test("timeout after successful provider write is reconciled with no second write", async () => {
  let writes = 0; let posts: any[] = [];
  const h = harness({ scheduled: async () => posts, schedule: async (date, info) => {
    writes++; posts = [{ id: "after-timeout", text: info.text, media: [], networks: ["facebook"], date, status: "scheduled" }];
    throw new Error("lost response");
  } });
  await executeMetricoolPublication(input, h.deps);
  const r = await executeMetricoolPublication(input, h.deps);
  assert.equal(r.postId, "after-timeout"); assert.equal(r.scheduled, true); assert.equal(writes, 1);
});
test("a returned ID without matching provider state is never a scheduled success", async () => {
  const h = harness({ schedule: async () => "id-only" });
  assert.equal((await executeMetricoolPublication(input, h.deps)).scheduled, false);
  assert.equal(h.state().reservations[0].postId, "id-only");
});
test("concurrent attempts and independent operation IDs cannot consume the last unit twice", async () => {
  let writes = 0;
  const h = harness({ published: async () => Array.from({ length: 19 }, (_, n) => ({ id: String(n), text: "Older", media: [], networks: ["facebook"], date: "2026-10-01T12:00:00", status: "published" })),
    schedule: async () => { writes++; return "concurrent-post"; } });
  await Promise.all([input, { ...input, text: "Different", operationId: "second" }].map(p => executeMetricoolPublication(p, h.deps)));
  assert.equal(writes, 1); assert.equal(h.state().reservations.length, 1);
});
test("brand mismatch, missing network, unavailable/invalid media and unknown best-times stay blocked", async () => {
  const variants = [
    harness({ brand: async () => ({ id: "other", label: "pro.hbtd", timezone: "Europe/Madrid", networks: ["facebook"] }) }),
    harness({ bestTimes: async () => [] }),
  ];
  for (const h of variants) { assert.equal((await executeMetricoolPublication(input, h.deps)).scheduled, false); assert.equal(h.writes(), 0); }
  for (const url of ["https://127.0.0.1/a", "http://example.org/a", "https://user:pass@example.org/a", "https://example.org/a"]) {
    const h = harness();
    const r = await executeMetricoolPublication({ ...input, networks: ["instagram"], media: [url] }, { ...h.deps, verifyMedia: async () => "text/html" });
    assert.equal(r.scheduled, false); assert.equal(h.writes(), 0);
  }
});
test("changing the request under an existing operation ID is rejected", async () => {
  const h = harness(); await executeMetricoolPublication(input, h.deps);
  assert.equal((await executeMetricoolPublication({ ...input, text: "Changed" }, h.deps)).reason, "OPERATION_ID_CONFLICT"); assert.equal(h.writes(), 1);
});
test("a provider status changes to published only on an explicit matching read", async () => {
  const h = harness(); await executeMetricoolPublication(input, h.deps);
  h.posted()[0].status = "published";
  const r = await executeMetricoolPublication(input, h.deps);
  assert.equal(r.status, "confirmed-published"); assert.equal(r.published, true); assert.equal(r.scheduled, false);
  assert.equal(h.writes(), 1);
});
test("a preview status read does not change persistent state", async () => {
  const h = harness(); await executeMetricoolPublication(input, h.deps);
  const version = h.state().version;
  assert.equal((await executeMetricoolPublication(input, { ...h.deps, dryRun: true })).scheduled, true);
  assert.equal(h.state().version, version); assert.equal(h.writes(), 1);
});
test("an unresolved last-unit reservation blocks a different operation", async () => {
  const h = harness({ published: async () => Array.from({ length: 19 }, (_, n) => ({ id: String(n), text: "Other", media: [], networks: ["facebook"], date: "2026-10-01T12:00:00", status: "published" })), schedule: async () => { throw new Error("uncertain"); } });
  await executeMetricoolPublication(input, h.deps);
  const r = await executeMetricoolPublication({ ...input, operationId: "different", text: "Other new copy" }, h.deps);
  assert.equal(r.status, "quota-exhausted"); assert.equal(r.budget?.reserved, 1); assert.equal(r.budget?.used, 19);
});
test("queued posts consume quota even when not published yet", async () => {
  const h = harness({ scheduled: async () => Array.from({ length: 20 }, (_, n) => ({ id: String(n), text: "Queued", media: [], networks: ["facebook"], date: "2026-10-28T12:00:00", status: "scheduled" })) });
  const r = await executeMetricoolPublication(input, h.deps);
  assert.equal(r.status, "quota-exhausted"); assert.equal(h.writes(), 0);
});
test("usage that changes during media/time planning is rechecked before the write", async () => {
  let reads = 0;
  const h = harness({ published: async () => ++reads === 1 ? [] : Array.from({ length: 20 }, (_, n) => ({ id: String(n), text: "Concurrent external post", media: [], networks: ["facebook"], date: "2026-10-01T12:00:00", status: "published" })) });
  const r = await executeMetricoolPublication(input, h.deps);
  assert.equal(r.reason, "MONTHLY_LIMIT_CHANGED"); assert.equal(h.writes(), 0);
  assert.equal(h.state().reservations.length, 0, "safe pre-write cancellation releases only its own reservation");
});
test("calendar months use brand timezone and DST gaps/ambiguities never produce invented slots", () => {
  assert.equal(monthWindow(new Date("2026-10-31T23:30:00Z"), "Europe/Madrid").month, "2026-11");
  assert.equal(wallClockInstant("2026-10-25T02:00:00", "Europe/Madrid"), null);
  assert.equal(wallClockInstant("2026-03-29T02:00:00", "Europe/Madrid"), null);
  assert.equal(wallClockInstant("2026-10-26T12:00:00", "Europe/Madrid"), Date.parse("2026-10-26T11:00:00Z"));
});
