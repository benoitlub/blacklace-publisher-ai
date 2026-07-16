export interface MistralTextRequest {
  title: string;
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface MistralTextArtifact {
  id: string;
  type: "text/markdown";
  title: string;
  content: string;
  mimeType: "text/markdown; charset=utf-8";
  createdAt: string;
  metadata: {
    provider: "mistral";
    model: string;
    finishReason: string | null;
    usage: unknown;
  };
}

function apiKey(): string {
  return (process.env.AI_API_KEY ?? process.env.MISTRAL_API_KEY ?? "").trim();
}

export function isMistralTextConfigured(): boolean {
  return Boolean(apiKey());
}

function modelName(): string {
  return (process.env.MISTRAL_MODEL ?? "mistral-small-latest").trim();
}

function safeContent(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part && typeof (part as { text?: unknown }).text === "string") {
          return (part as { text: string }).text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
}

export async function executeMistralText(request: MistralTextRequest): Promise<MistralTextArtifact> {
  const key = apiKey();
  if (!key) throw new Error("Mistral n'est pas configuré dans Publisher.");
  if (!request.prompt.trim()) throw new Error("Le prompt Mistral est vide.");

  const model = modelName();
  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: Number.isFinite(request.temperature) ? request.temperature : 0.25,
      max_tokens: Number.isFinite(request.maxTokens) ? request.maxTokens : 5000,
      messages: [
        {
          role: "system",
          content: request.systemPrompt?.trim() || "Tu es le producteur textuel de Blacklace Publisher. Produis le livrable demandé, complet, factuel et directement exploitable. N'invente aucune donnée réelle manquante.",
        },
        { role: "user", content: request.prompt },
      ],
    }),
  });

  const payload = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok) {
    const message = payload?.message ?? payload?.error?.message ?? `Mistral ${response.status}`;
    throw new Error(String(message));
  }

  const choice = Array.isArray(payload.choices) ? payload.choices[0] : null;
  const content = safeContent(choice?.message?.content);
  if (!content) throw new Error("Mistral n'a retourné aucun texte exploitable.");

  return {
    id: `mistral-text-${Date.now()}`,
    type: "text/markdown",
    title: request.title,
    content,
    mimeType: "text/markdown; charset=utf-8",
    createdAt: new Date().toISOString(),
    metadata: {
      provider: "mistral",
      model,
      finishReason: typeof choice?.finish_reason === "string" ? choice.finish_reason : null,
      usage: payload.usage ?? null,
    },
  };
}
