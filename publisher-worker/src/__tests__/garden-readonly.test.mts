import test from "node:test";
import assert from "node:assert/strict";
import { createGardenReader } from "../garden-readonly.ts";
test("public revision fallback survives rejected tokens and REST rate limits without forwarding credentials", async () => {
  for (const status of [401, 403]) {
    const f = fixtureFetcher();
    const calls: string[] = [];
    const read = createGardenReader(async (input, options) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/commits/main"))
        return new Response("unavailable", { status });
      if (url.endsWith("/commits/main.atom")) {
        assert.equal(new Headers(options?.headers).has("Authorization"), false);
        return new Response(
          `<feed><entry><id>tag:github.com,2008:Grit::Commit/${sha}</id></entry></feed>`,
        );
      }
      return f.fetcher(input, options);
    });
    const response = await read(new Request(endpoint), {
      GITHUB_TOKEN: "REJECTED-TEST-TOKEN",
    });
    assert.equal(response.status, 200);
    const snapshot = (await response.json()) as any;
    assert.equal(snapshot.sourceRef, sha);
    assert.ok(
      calls.includes(
        "https://github.com/benoitlub/poulpe-fiction/commits/main.atom",
      ),
    );
    assert.ok(!JSON.stringify(snapshot).includes("REJECTED-TEST-TOKEN"));
  }
});
test("malformed public first commit fails closed, even if a later entry has a valid id", async () => {
  const read = createGardenReader(async (input) =>
    String(input).endsWith(".atom")
      ? new Response(
          `<feed><entry><id>bad</id></entry><entry><id>tag:github.com,2008:Grit::Commit/${sha}</id></entry></feed>`,
        )
      : new Response("unavailable", { status: 401 }),
  );
  assert.equal((await read(new Request(endpoint), {})).status, 503);
});
// Synthetic source records only. Never execute a mission or contact a provider.
const sha = "a".repeat(40);
const endpoint = "https://publisher.example/api/garden/v1/snapshot";
function fixtureFetcher(fail = "") {
  const calls: { url: string; options: RequestInit | undefined }[] = [];
  const fetcher = async (input: RequestInfo | URL, options?: RequestInit) => {
    const url = String(input);
    calls.push({ url, options });
    assert.equal(options?.method, "GET");
    assert.equal(options?.redirect, "error");
    if (fail && url.includes(fail)) throw Error("SECRET upstream error");
    const data = url.endsWith("/commits/main")
      ? { sha }
      : url.endsWith("restart-seeds.json")
        ? { seeds: [{ parcelId: "poulpe-fiction", objective: "PRIVATE" }] }
        : url.endsWith("gerard-state.json")
          ? {
              learningHistory: [
                {
                  operationId: "test-operation",
                  mode: "cultivate",
                  parcelId: "poulpe-fiction",
                  at: "2026-10-25T09:00:00Z",
                  outcome: "failed",
                  error: "PRIVATE token",
                },
              ],
            }
          : url.endsWith("harvests.json")
            ? { harvests: [] }
            : { events: [] };
    return new Response(JSON.stringify(data));
  };
  return { fetcher, calls };
}
test("endpoint reads fixed URLs at one pinned commit, filters private data, caches public projection", async () => {
  const f = fixtureFetcher();
  let now = Date.parse("2026-10-25T10:00:00Z");
  const read = createGardenReader(f.fetcher, () => now);
  const env = { GITHUB_TOKEN: "TEST-TOKEN" };
  const results = await Promise.all([
    read(new Request(endpoint), env),
    read(new Request(endpoint), env),
  ]);
  assert.equal(f.calls.length, 5);
  const s = (await results[0].json()) as any;
  assert.equal(s.sourceRef, sha);
  assert.equal(s.events[0].status, "failed");
  assert.ok(!JSON.stringify(s).includes("PRIVATE"));
  assert.ok(!JSON.stringify(s).includes("TEST-TOKEN"));
  for (const c of f.calls) {
    if (c.url.includes("raw.githubusercontent.com")) {
      assert.ok(c.url.includes(sha));
      assert.equal(new Headers(c.options?.headers).has("Authorization"), false);
    }
  }
  await read(new Request(endpoint), env);
  assert.equal(f.calls.length, 5);
  now += 46000;
  await read(new Request(endpoint), env);
  assert.equal(f.calls.length, 10);
});
test("POST and arbitrary queries are rejected without touching a source", async () => {
  const f = fixtureFetcher();
  const read = createGardenReader(f.fetcher);
  assert.equal(
    (await read(new Request(endpoint, { method: "POST" }), {})).status,
    405,
  );
  assert.equal(
    (await read(new Request(endpoint + "?url=https://evil.example"), {}))
      .status,
    400,
  );
  assert.equal(f.calls.length, 0);
});
test("one unavailable source produces partial metadata; revision failure yields generic 503", async () => {
  const partial = createGardenReader(fixtureFetcher("/events").fetcher);
  const response = await partial(new Request(endpoint), {});
  assert.equal(response.status, 200);
  const s = (await response.json()) as any;
  assert.equal(
    s.sources.find((s: any) => s.id === "octopus").state,
    "unavailable",
  );
  const down = createGardenReader(fixtureFetcher("/commits/main").fetcher);
  const failed = await down(new Request(endpoint), {});
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { error: "GARDEN_SOURCE_UNAVAILABLE" });
});
test("service binding reads only /events and never falls back to a mutation or health probe", async () => {
  const f = fixtureFetcher();
  let bound = 0;
  const read = createGardenReader(f.fetcher);
  await read(new Request(endpoint), {
    OCTOPUS_ENGINE: {
      fetch: async (input, options) => {
        bound++;
        assert.equal(new URL(String(input)).pathname, "/events");
        assert.equal(options?.method, "GET");
        return new Response('{"events":[]}');
      },
    },
  });
  assert.equal(bound, 1);
  assert.ok(f.calls.every((c) => !c.url.endsWith("/events")));
});
