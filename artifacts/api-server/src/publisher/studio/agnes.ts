/** Agnes Video Flash: explicit opt-in only. No automatic scheduling or publishing. */
export type AgnesTask = { video_id: string; status?: string };
export type AgnesState = "queued" | "in_progress" | "completed" | "failed";
const endpoint = "https://apihub.agnes-ai.com";
const model = "agnes-video-2.5-flash";

export class AgnesVideoError extends Error {
  constructor(public readonly code: string) { super(code); }
}
export function agnesConfigured(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env.AGNES_API_KEY?.trim());
}
/** Requires explicit user authorization; no separate zero-cost attestation gate. */
export async function submitAgnesVideo(
  prompt: string,
  options: { confirmedZeroCost?: boolean; authorized: boolean; key?: string; fetcher?: typeof fetch },
): Promise<AgnesTask> {
  if (!options.authorized)
    throw new AgnesVideoError("AGNES_AUTHORIZATION_REQUIRED");
  const key = options.key ?? process.env.AGNES_API_KEY;
  if (!key?.trim()) throw new AgnesVideoError("AGNES_API_KEY_MISSING");
  if (!prompt.trim() || prompt.length > 1000) throw new AgnesVideoError("AGNES_PROMPT_INVALID");
  const response = await (options.fetcher ?? fetch)(endpoint + "/v1/videos", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ model, mode: "text", prompt, seconds: "5", size: "720P", aspect_ratio: "9:16" }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new AgnesVideoError("AGNES_SUBMISSION_HTTP_" + response.status);
  const data: unknown = await response.json();
  const task = data as Record<string, unknown>;
  if (typeof task?.video_id !== "string" || !task.video_id.trim())
    throw new AgnesVideoError("AGNES_TASK_ID_MISSING");
  return { video_id: task.video_id };
}
/** Poll once; caller owns retry budget, backoff and idempotency. */
export async function pollAgnesVideo(
  videoId: string,
  options: { key?: string; fetcher?: typeof fetch } = {},
): Promise<{ status: AgnesState; videoUrl?: string }> {
  const key = options.key ?? process.env.AGNES_API_KEY;
  if (!key?.trim()) throw new AgnesVideoError("AGNES_API_KEY_MISSING");
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(videoId)) throw new AgnesVideoError("AGNES_TASK_ID_INVALID");
  const url = endpoint + "/agnesapi?video_id=" + encodeURIComponent(videoId) + "&model_name=" + model;
  const response = await (options.fetcher ?? fetch)(url, {
    headers: { Authorization: "Bearer " + key },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new AgnesVideoError("AGNES_POLL_HTTP_" + response.status);
  const data = await response.json() as Record<string, unknown>;
  const status = data.status;
  if (!["queued", "in_progress", "completed", "failed"].includes(String(status)))
    throw new AgnesVideoError("AGNES_UNKNOWN_STATUS");
  // Never fetch provider-supplied URLs directly; separate downloader must validate destinations.
  return { status: status as AgnesState };
}
