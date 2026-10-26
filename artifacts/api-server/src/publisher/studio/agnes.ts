import { writeFile } from "node:fs/promises";
import path from "node:path";
import { decode, probe, StudioError } from "./runtime";

/**
 * Optional text-to-video provider. Never called from the default studio path.
 * There is no reliable public balance/pricing endpoint: authorization must
 * carry a recent operator-verified zero-dollar price, and expires in <= 24h.
 * A missing key or price proof fails closed before any provider request.
 */
export interface AgnesZeroCostGrant {
  verifiedAt: string;
  expiresAt: string;
  usdPerSecond: 0;
}
export interface AgnesClip {
  prompt: string;
  seconds: number;
  zeroCostGrant: AgnesZeroCostGrant;
}
const endpoint = "https://apihub.agnes-ai.com";
const model = "agnes-video-2.5-flash";
export function checkAgnesZeroCost(clip: AgnesClip, now = Date.now()) {
  if (!clip || typeof clip.prompt !== "string" || clip.prompt.trim().length < 5 ||
    clip.prompt.length > 1600 || !Number.isInteger(clip.seconds) ||
    clip.seconds < 4 || clip.seconds > 12)
    throw new StudioError("AGNES_CLIP_INVALID");
  const proof = clip.zeroCostGrant;
  const verified = Date.parse(proof?.verifiedAt);
  const expires = Date.parse(proof?.expiresAt);
  if (proof?.usdPerSecond !== 0 || !Number.isFinite(verified) ||
    !Number.isFinite(expires) || verified > now ||
    expires <= now || expires - verified > 24 * 60 * 60 * 1000)
    throw new StudioError("AGNES_ZERO_COST_NOT_VERIFIED");
  if (!process.env.AGNES_API_KEY)
    throw new StudioError("AGNES_API_KEY_MISSING");
}
export async function generateAgnesClip(
  clip: AgnesClip,
  dir: string,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
) {
  checkAgnesZeroCost(clip, now);
  // No retries for task creation: an ambiguous 502/timeout may have billed.
  const headers = {
    Authorization: `Bearer ${process.env.AGNES_API_KEY}`,
    "Content-Type": "application/json",
  };
  const create = await fetcher(`${endpoint}/v1/videos`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model, prompt: clip.prompt, seconds: String(clip.seconds),
      mode: "text", size: "720P", aspect_ratio: "9:16", n: 1,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!create.ok) throw new StudioError("AGNES_CREATE_UNCERTAIN_NO_RETRY");
  const task = await create.json() as Record<string, unknown>;
  const id = task.video_id;
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,150}$/.test(id))
    throw new StudioError("AGNES_VIDEO_ID_MISSING");
  const pollUrl = `${endpoint}/agnesapi?video_id=${encodeURIComponent(id)}&model_name=${model}`;
  const deadline = Date.now() + 8 * 60_000;
  while (Date.now() < deadline) {
    const r = await fetcher(pollUrl, {
      headers: { Authorization: headers.Authorization },
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) throw new StudioError("AGNES_POLL_UNAVAILABLE");
    const result = await r.json() as Record<string, unknown>;
    if (result.status === "failed") throw new StudioError("AGNES_GENERATION_FAILED");
    if (result.status === "completed") {
      if (typeof result.url !== "string") throw new StudioError("AGNES_RESULT_URL_MISSING");
      const url = new URL(result.url);
      if (url.protocol !== "https:" || !url.hostname ||
        url.username || url.password ||
        /^(localhost|127\\.|10\\.|192\\.168\\.|169\\.254\\.)/.test(url.hostname))
        throw new StudioError("AGNES_RESULT_URL_UNSAFE");
      // Provider supplied URL: never forward our API key to the file host.
      const media = await fetcher(url, { signal: AbortSignal.timeout(60_000) });
      const size = Number(media.headers.get("content-length") || "0");
      if (!media.ok || size > 50_000_000)
        throw new StudioError("AGNES_DOWNLOAD_FAILED");
      const data = Buffer.from(await media.arrayBuffer());
      if (data.length > 50_000_000 || data.length < 1024)
        throw new StudioError("AGNES_VIDEO_SIZE_INVALID");
      const file = path.join(dir, "agnes-clip.mp4");
      await writeFile(file, data);
      const metadata = await probe(file);
      const stream = metadata.streams.find((s) => s.codec_type === "video");
      if (!stream || stream.width !== 720 || stream.height !== 1280)
        throw new StudioError("AGNES_VIDEO_FORMAT_INVALID");
      await decode(file);
      return { provider: "agnes", model, seconds: clip.seconds, videoId: id,
        filename: "agnes-clip.mp4", priceVerifiedAt: clip.zeroCostGrant.verifiedAt,
        declaredProviderCostUsd: 0, verification: "provider-promo-operator-attested" };
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new StudioError("AGNES_GENERATION_TIMEOUT_UNKNOWN");
}
