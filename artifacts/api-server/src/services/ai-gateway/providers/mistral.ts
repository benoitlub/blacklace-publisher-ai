import type { AiTaskType } from "../task-types";
import type { AiGatewayRequest, AiGatewayResponse, AiProvider } from "../types";

const MISTRAL_BASE_URL = "https://api.mistral.ai/v1";
const DEFAULT_MISTRAL_MODEL = "mistral-small-latest";

const SUPPORTED_TASKS: readonly AiTaskType[] = [
  "text.post",
  "text.thread",
  "text.summary",
  "image.prompt",
  "video.prompt",
  "video.storyboard",
  "translation",
  "metadata.tags"
];

export class MistralGatewayProvider implements AiProvider {
  readonly id = "mistral";
  readonly isFreeTier = true;
  readonly model: string;

  constructor(
    private readonly apiKey: string | undefined = process.env.MISTRAL_API_KEY,
    model = process.env.MISTRAL_MODEL ?? DEFAULT_MISTRAL_MODEL
  ) {
    this.model = model;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  supports(task: AiTaskType): boolean {
    return SUPPORTED_TASKS.includes(task);
  }

  async generate(request: AiGatewayRequest): Promise<AiGatewayResponse> {
    if (!this.apiKey) {
      return {
        ok: false,
        provider: this.id,
        model: this.model,
        output: "",
        error: "Provider not configured"
      };
    }

    try {
      const response = await fetch(`${MISTRAL_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: createMessages(request),
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? 700
        })
      });

      if (!response.ok) {
        return {
          ok: false,
          provider: this.id,
          model: this.model,
          output: "",
          error: `Provider returned HTTP ${response.status}`
        };
      }

      const data = (await response.json()) as MistralChatCompletion;
      return {
        ok: true,
        provider: this.id,
        model: data.model ?? this.model,
        output: data.choices[0]?.message.content ?? "",
        usage: {
          inputTokens: data.usage?.prompt_tokens,
          outputTokens: data.usage?.completion_tokens
        }
      };
    } catch {
      return {
        ok: false,
        provider: this.id,
        model: this.model,
        output: "",
        error: "Provider request failed"
      };
    }
  }
}

interface MistralChatCompletion {
  readonly model?: string;
  readonly choices: ReadonlyArray<{
    readonly message: {
      readonly content: string;
    };
  }>;
  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
  };
}

function createMessages(request: AiGatewayRequest): Array<{ role: "system" | "user"; content: string }> {
  return [
    {
      role: "system",
      content:
        request.system ??
        "Tu es une capability serveur de Publisher AI. Reponds uniquement au besoin demande, sans exposer de configuration interne."
    },
    {
      role: "user",
      content: [
        `Task: ${request.task}`,
        request.universe ? `Universe: ${request.universe}` : null,
        request.agent ? `Agent: ${request.agent}` : null,
        `Prompt: ${request.prompt}`
      ]
        .filter(Boolean)
        .join("\n")
    }
  ];
}
