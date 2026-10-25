import { buildFeed } from "./garden/feed.mjs";
import type { GardenSnapshot } from "./garden/contracts";

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
type Secret = string | { get(): Promise<string> };
export interface GardenReadEnv {
  GITHUB_TOKEN?: Secret;
  OCTOPUS_ENGINE?: { fetch: Fetcher };
}
const REPO = "https://api.github.com/repos/benoitlub/poulpe-fiction";
const PUBLIC_COMMITS =
  "https://github.com/benoitlub/poulpe-fiction/commits/main.atom";
const RAW = "https://raw.githubusercontent.com/benoitlub/poulpe-fiction";
const OCTOPUS = "https://octopus-engine-app.benoitlubert.workers.dev/events";
const MAX_BYTES = 2 * 1024 * 1024;

/** All URLs are fixed or derived from a validated commit SHA. No user URL is accepted. */
async function readText(
  fetcher: Fetcher,
  url: string,
  headers: Record<string, string> = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetcher(url, {
      method: "GET",
      headers: { Accept: "application/json", ...headers },
      // Workerd supports manual/follow only. Manual plus !ok rejects every 3xx.
      redirect: "manual",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Source unavailable");
    if (Number(response.headers.get("content-length") ?? 0) > MAX_BYTES)
      throw new Error("Source too large");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Missing source body");
    const decoder = new TextDecoder();
    let raw = "",
      bytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BYTES) {
          await reader.cancel();
          throw new Error("Source too large");
        }
        raw += decoder.decode(value, { stream: true });
      }
      raw += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    return raw;
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(
  fetcher: Fetcher,
  url: string,
  headers: Record<string, string> = {},
) {
  return JSON.parse(await readText(fetcher, url, headers));
}

async function readRevision(fetcher: Fetcher, token: string): Promise<string> {
  try {
    const head = await readJson(fetcher, `${REPO}/commits/main`, {
      "User-Agent": "Poulpe-Garden-ReadOnly",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    });
    if (!/^[a-f0-9]{40}$/.test(head?.sha))
      throw new Error("Invalid source revision");
    return head.sha;
  } catch {
    // Public repository only. GitHub's Atom feed remains readable when the
    // configured token expires or the shared REST rate limit is exhausted.
    // Extract the first commit only; never parse XML entities or follow links.
    const atom = await readText(fetcher, PUBLIC_COMMITS, {
      Accept: "application/atom+xml",
    });
    const entry = atom.match(/<entry\b[^>]*>([\s\S]*?)<\/entry>/)?.[1];
    const sha = entry?.match(
      /<id>tag:github\.com,2008:Grit::Commit\/([a-f0-9]{40})<\/id>/,
    )?.[1];
    if (!sha) throw new Error("Public source revision unavailable");
    return sha;
  }
}

/** Factory isolates cache and allows network-free tests. Cache is public, sanitized metadata only. */
export function createGardenReader(
  fetcher: Fetcher = fetch,
  now: () => number = Date.now,
) {
  let cached: { until: number; value: GardenSnapshot } | undefined;
  let pending: Promise<GardenSnapshot> | undefined;
  async function collect(env: GardenReadEnv) {
    let token = "";
    try {
      token =
        typeof env.GITHUB_TOKEN === "string"
          ? env.GITHUB_TOKEN
          : ((await env.GITHUB_TOKEN?.get()) ?? "");
    } catch {
      /* public read can still succeed */
    }
    const revision = await readRevision(fetcher, token);
    const base = `${RAW}/${revision}/garden/`;
    const readOctopus = env.OCTOPUS_ENGINE
      ? env.OCTOPUS_ENGINE.fetch.bind(env.OCTOPUS_ENGINE)
      : fetcher;
    const [seeds, state, harvests, octopus] = await Promise.allSettled([
      readJson(fetcher, base + "restart-seeds.json"),
      readJson(fetcher, base + "gerard-state.json"),
      readJson(fetcher, base + "harvests.json"),
      readJson(readOctopus, OCTOPUS),
    ]);
    if (seeds.status !== "fulfilled")
      throw new Error("Project scope unavailable");
    return buildFeed({
      seeds: seeds.value,
      state: state.status === "fulfilled" ? state.value : undefined,
      harvests: harvests.status === "fulfilled" ? harvests.value : undefined,
      octopus: octopus.status === "fulfilled" ? octopus.value : undefined,
      sourceRef: revision,
      observedAt: new Date(now()).toISOString(),
    });
  }
  return async function read(
    request: Request,
    env: GardenReadEnv,
  ): Promise<Response> {
    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    };
    if (request.method !== "GET")
      return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), {
        status: 405,
        headers: { ...headers, Allow: "GET" },
      });
    if (new URL(request.url).search)
      return new Response(JSON.stringify({ error: "QUERY_NOT_SUPPORTED" }), {
        status: 400,
        headers,
      });
    try {
      if (cached && cached.until > now())
        return new Response(JSON.stringify(cached.value), { headers });
      if (!pending)
        pending = collect(env)
          .then((value) => {
            cached = { until: now() + 45000, value };
            return value;
          })
          .finally(() => {
            pending = undefined;
          });
      return new Response(JSON.stringify(await pending), { headers });
    } catch {
      return new Response(
        JSON.stringify({ error: "GARDEN_SOURCE_UNAVAILABLE" }),
        { status: 503, headers: { ...headers, "Retry-After": "60" } },
      );
    }
  };
}
export const readGarden = createGardenReader();
