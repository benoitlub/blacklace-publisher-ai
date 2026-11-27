import type { TextRequest } from "./cloudflare-text";

// Explicit free-tier text model; no automatic model/provider upgrades.
export const GEMINI_TEXT_MODEL = "gemini-3.1-flash-lite";

export async function generateGeminiText(apiKey: string, request: TextRequest, fetcher: typeof fetch = fetch) {
  if (!apiKey.trim()) throw new Error("gemini-text-key-missing");
  const system = request.systemPrompt?.trim() || "Produis le texte demandé en français, complet et factuel. N'invente aucune information.";
  if (!request.prompt.trim()) throw new Error("text-prompt-required");
  if (new TextEncoder().encode(system + request.prompt).byteLength > 16000) throw new Error("text-context-too-large");
  const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey.trim() },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: request.prompt }] }],
      generationConfig: {
        maxOutputTokens: Math.min(1000, Math.max(1, Math.floor(request.maxTokens || 500))),
        temperature: Math.min(2, Math.max(0, request.temperature ?? 0.25)),
      },
    }),
    signal: AbortSignal.timeout(45000),
  });
  // Never expose provider messages, which may contain a key/project identifier.
  // Quota errors stay visible; no retry or paid-provider fallback.
  if (!response.ok) throw new Error(`gemini-text-http-${response.status}`);
  const payload = await response.json() as Record<string, any>;
  const candidate = payload.candidates?.[0];
  const parts = candidate?.content?.parts;
  const content = Array.isArray(parts) ? parts.filter(part => part.thought !== true && typeof part.text === "string").map(part => part.text).join("").trim() : "";
  if (!content || payload.promptFeedback?.blockReason) throw new Error("gemini-text-no-final-content");
  if (candidate.finishReason && candidate.finishReason !== "STOP") throw new Error("gemini-text-incomplete-content");
  return { id: `gemini-text-${crypto.randomUUID()}`, title: request.title, content,
    type: "text/markdown", mimeType: "text/markdown; charset=utf-8", createdAt: new Date().toISOString(),
    metadata: { provider: "google-gemini", model: GEMINI_TEXT_MODEL, modelVersion: payload.modelVersion ?? null,
      usage: payload.usageMetadata ?? null } };
}
