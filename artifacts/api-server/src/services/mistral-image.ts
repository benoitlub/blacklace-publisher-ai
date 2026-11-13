/** Shared by the existing Node Studio and Worker; no SDK or remote agent needed. */
export const MISTRAL_IMAGE_MODEL = "mistral-medium-latest";
export type ImageStage = "configuration" | "agent" | "conversation" | "download";
export class MistralImageError extends Error {
  constructor(
    public code: string,
    public httpStatus: number,
    public stage: ImageStage,
    public retryAfter?: string,
    public conversationId?: string,
    public providerOutcomeMayBeUnknown = false,
  ) { super(code); }
  toJSON() {
    return {
      code: this.code, httpStatus: this.httpStatus,
      ...(this.retryAfter ? { retryAfter: this.retryAfter } : {}),
      retryAllowed: (this.httpStatus === 429 && !this.providerOutcomeMayBeUnknown) ||
        (this.stage === "download" && ["MISTRAL_IMAGE_NETWORK_FAILED", "MISTRAL_IMAGE_UPSTREAM_FAILED", "MISTRAL_IMAGE_DOWNLOAD_INTERRUPTED"].includes(this.code) && this.httpStatus >= 500),
      providerOutcomeMayBeUnknown: this.providerOutcomeMayBeUnknown,
      provider: { service: "mistral", model: MISTRAL_IMAGE_MODEL, stage: this.stage,
        endpoint: this.stage === "download" ? "/v1/files/{file_id}/content" :
          this.stage === "agent" ? "/v1/agents" : "/v1/conversations",
        ...(this.conversationId ? { conversationId: this.conversationId } : {}) },
    };
  }
}
function errorCode(status: number) {
  return status === 429 ? "MISTRAL_IMAGE_RATE_LIMITED" :
    status === 401 ? "MISTRAL_IMAGE_AUTHENTICATION_FAILED" :
    status === 402 ? "MISTRAL_IMAGE_BILLING_REQUIRED" :
    status === 403 ? "MISTRAL_IMAGE_ACCESS_DENIED" : "MISTRAL_IMAGE_UPSTREAM_FAILED";
}
export async function mistralImageFetch(
  key: string, url: string, init: RequestInit, stage: ImageStage,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  if (!key.trim()) throw new MistralImageError("MISTRAL_IMAGE_NOT_CONFIGURED", 503, "configuration");
  let response: Response;
  try {
    response = await fetchImpl(url, { ...init,
      headers: { ...init.headers, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(80000), redirect: "error" });
  } catch {
    // Never retry an uncertain billable request.
    throw new MistralImageError("MISTRAL_IMAGE_NETWORK_FAILED", 502, stage, undefined, undefined, stage === "conversation");
  }
  if (!response.ok)
    throw new MistralImageError(errorCode(response.status), response.status, stage,
      response.headers.get("retry-after")?.slice(0, 100), undefined,
      stage === "conversation" && response.status >= 500);
  return response;
}
export async function generateMistralImage(key: string, prompt: string, fetchImpl: typeof fetch = fetch) {
  if (!prompt.trim()) throw new MistralImageError("MISTRAL_IMAGE_PROMPT_REQUIRED", 400, "configuration");
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  const agentResponse = await mistralImageFetch(key, "https://api.mistral.ai/v1/agents", {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "Publisher Image Studio",
      model: MISTRAL_IMAGE_MODEL,
      instructions: "Use image_generation to produce the requested image, not a description. Do not add readable text unless explicitly requested.",
      tools: [{ type: "image_generation" }],
      completion_args: { temperature: 0.3 },
    }),
  }, "agent", fetchImpl);
  const agent = await agentResponse.json().catch(() => null);
  if (typeof agent?.id !== "string" || !agent.id.trim())
    throw new MistralImageError("MISTRAL_IMAGE_AGENT_ID_MISSING", 502, "agent");

  const response = await mistralImageFetch(key, "https://api.mistral.ai/v1/conversations", {
    method: "POST",
    headers,
    body: JSON.stringify({ agent_id: agent.id, inputs: prompt }),
  }, "conversation", fetchImpl);
  const payload = await response.json().catch(() => null) as any;
  const conversationId = typeof payload?.conversation_id === "string" ? payload.conversation_id : undefined;
  // Only an image-generation output is proof of a generated file. Input files,
  // code-interpreter files and textual mentions of file IDs are not evidence.
  const chunks = Array.isArray(payload?.outputs)
    ? payload.outputs.filter((o: any) => o?.type === "message.output" && o.role === "assistant")
        .flatMap((o: any) => Array.isArray(o.content) ? o.content : [])
    : [];
  const chunk = chunks.find((c: any) => c?.type === "tool_file" && c.tool === "image_generation" &&
    typeof c.file_id === "string" && c.file_id.trim());
  if (!chunk)
    throw new MistralImageError("MISTRAL_IMAGE_FILE_MISSING", 502, "conversation", undefined, conversationId, true);
  return { provider: "mistral" as const, capability: "visual.generate" as const,
    model: MISTRAL_IMAGE_MODEL, conversationId: conversationId ?? "", fileId: chunk.file_id.trim() };
}
export async function downloadMistralImage(key: string, fileId: string, fetchImpl: typeof fetch = fetch) {
  const response = await mistralImageFetch(key,
    `https://api.mistral.ai/v1/files/${encodeURIComponent(fileId)}/content`,
    {}, "download", fetchImpl);
  const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!["image/png", "image/jpeg", "image/webp", "application/octet-stream"].includes(type))
    throw new MistralImageError("MISTRAL_IMAGE_CONTENT_TYPE_INVALID", 502, "download");
  if (type !== "application/octet-stream") return response;
  // Mistral also serves image files as octet-stream. Keep existing media URLs
  // usable, deriving their image MIME from bytes rather than labelling HTML PNG.
  const reader = response.body?.getReader();
  if (!reader) throw new MistralImageError("MISTRAL_IMAGE_CONTENT_TYPE_INVALID", 502, "download");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (length < 12) {
      const part = await reader.read();
      if (part.done) break;
      chunks.push(part.value); length += part.value.length;
    }
  } catch { throw new MistralImageError("MISTRAL_IMAGE_DOWNLOAD_INTERRUPTED", 502, "download"); }
  const prefix = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { prefix.set(chunk, offset); offset += chunk.length; }
  const mime = [137,80,78,71,13,10,26,10].every((b,i) => prefix[i] === b) ? "image/png" :
    prefix[0] === 255 && prefix[1] === 216 && prefix[2] === 255 ? "image/jpeg" :
    String.fromCharCode(...prefix.subarray(0,4)) === "RIFF" &&
      String.fromCharCode(...prefix.subarray(8,12)) === "WEBP" ? "image/webp" : null;
  if (!mime) {
    await reader.cancel().catch(() => {});
    throw new MistralImageError("MISTRAL_IMAGE_CONTENT_TYPE_INVALID", 502, "download");
  }
  const body = new ReadableStream<Uint8Array>({
    start(controller) { for (const chunk of chunks) controller.enqueue(chunk); },
    async pull(controller) {
      try {
        const part = await reader.read();
        if (part.done) controller.close(); else controller.enqueue(part.value);
      } catch { controller.error(new MistralImageError("MISTRAL_IMAGE_DOWNLOAD_INTERRUPTED", 502, "download")); }
    },
    cancel(reason) { return reader.cancel(reason); },
  });
  return new Response(body, { headers: { "content-type": mime } });
}

