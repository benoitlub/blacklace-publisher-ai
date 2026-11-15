import type { AiTaskType } from "../task-types";
import type { AiGatewayRequest, AiGatewayResponse, AiProvider } from "../types";

const TASKS: readonly AiTaskType[] = [
  "text.post", "text.thread", "text.summary", "image.prompt",
  "video.prompt", "video.storyboard", "translation", "metadata.tags"
];

/** Server-side OpenAI-compatible chat adapter; credentials never reach the client. */
export class CompatibleChatProvider implements AiProvider {
  readonly isFreeTier: boolean;

  constructor(
    readonly id: string,
    readonly model: string,
    private readonly endpoint: string,
    private readonly apiKey?: string,
    isFreeTier = false
  ) {
    this.isFreeTier = isFreeTier;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey?.trim() && this.model.trim());
  }

  supports(task: AiTaskType): boolean {
    return TASKS.includes(task);
  }

  async generate(request: AiGatewayRequest): Promise<AiGatewayResponse> {
    if (!this.isConfigured()) {
      return { ok: false, provider: this.id, model: this.model, output: "", error: "Provider not configured" };
    }

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: request.system ?? "Tu es une capability serveur de Publisher AI." },
            { role: "user", content: `Task: ${request.task}\n${request.prompt}` }
          ],
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? 700
        }),
        signal: AbortSignal.timeout(25000)
      });

      if (!response.ok) {
        return { ok: false, provider: this.id, model: this.model, output: "", error: `Provider returned HTTP ${response.status}` };
      }

      const data = (await response.json()) as {
        model?: string;
        choices?: Array<{ message?: { content?: string | null } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const output = data.choices?.[0]?.message?.content?.trim();
      if (!output) {
        return { ok: false, provider: this.id, model: this.model, output: "", error: "Provider returned empty output" };
      }
      return {
        ok: true,
        provider: this.id,
        model: data.model ?? this.model,
        output,
        usage: { inputTokens: data.usage?.prompt_tokens, outputTokens: data.usage?.completion_tokens }
      };
    } catch {
      return { ok: false, provider: this.id, model: this.model, output: "", error: "Provider request failed" };
    }
  }
}
