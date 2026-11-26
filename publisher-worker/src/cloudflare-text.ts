export interface TextRequest { title: string; prompt: string; systemPrompt?: string; maxTokens?: number; temperature?: number }
export interface TextAiBinding { run(model: string, input: Record<string, unknown>): Promise<unknown> }
export const TEXT_MODEL = "@cf/google/gemma-4-26b-a4b-it";
export async function generateCloudflareText(ai: TextAiBinding | undefined, request: TextRequest, reserve: () => Promise<boolean>) {
  if (!ai) throw new Error("cloudflare-text-binding-missing");
  const system = request.systemPrompt?.trim() || "Produis le texte demandé en français, complet et factuel. N'invente aucune information.";
  if (!request.prompt.trim()) throw new Error("text-prompt-required");
  if (new TextEncoder().encode(system + request.prompt).byteLength > 16000) throw new Error("text-context-too-large");
  if (!await reserve()) throw new Error("cloudflare-text-daily-budget-exhausted");
  // One attempt only. A failed/uncertain call keeps its budget reservation.
  const payload = await ai.run(TEXT_MODEL, {
    messages: [{ role: "system", content: system }, { role: "user", content: request.prompt }],
    max_completion_tokens: Math.min(1000, Math.max(1, Math.floor(request.maxTokens || 500))),
    temperature: Math.min(2, Math.max(0, request.temperature ?? 0.25)), stream: false,
    chat_template_kwargs: { enable_thinking: false },
  }) as Record<string, any>;
  const value = payload?.choices?.[0]?.message?.content ?? payload?.response;
  if (typeof value !== "string" || !value.trim() || /<think>/i.test(value)) throw new Error("cloudflare-text-no-final-content");
  return { id: `cloudflare-text-${crypto.randomUUID()}`, title: request.title, content: value.trim(),
    type: "text/markdown", mimeType: "text/markdown; charset=utf-8", createdAt: new Date().toISOString(),
    metadata: { provider: "cloudflare-workers-ai", model: TEXT_MODEL, usage: payload.usage ?? null } };
}
