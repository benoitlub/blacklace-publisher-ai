import { getAIProvider } from "../../ai/providerRegistry";

export type ProducerCapability =
  | "copy.generate"
  | "landing-page"
  | "social-visual"
  | "voice-over"
  | "video"
  | "publish"
  | "email";

export type ProducerStatus = "available" | "authorized" | "offline" | "not-configured";
export type ProductionCost = "none" | "low" | "medium" | "high" | "unknown";
export type ProductionQuality = "basic" | "standard" | "high";

export interface ProductionRequest {
  id: string;
  capability: ProducerCapability;
  title: string;
  objective?: string;
  input?: Record<string, unknown>;
  preferredProducerId?: string;
  constraints?: {
    maxCost?: ProductionCost;
    minQuality?: ProductionQuality;
  };
}

export interface ProductionArtifact {
  id: string;
  requestId: string;
  stepId: string;
  producerId: string;
  capability: ProducerCapability;
  type: string;
  title: string;
  content?: string;
  url?: string | null;
  downloadUrl?: string | null;
  mimeType?: string | null;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface ExecutionReport {
  planId: string;
  status: "completed" | "partial" | "failed";
  artifacts: ProductionArtifact[];
  errors: Array<{ stepId: string; producerId: string; message: string }>;
}

export interface Producer {
  id: string;
  label: string;
  capability: ProducerCapability;
  connector: "local" | "mistral" | "canva" | "elevenlabs" | "kling" | "metricool" | "gmail";
  cost: ProductionCost;
  quality: ProductionQuality;
  status: ProducerStatus;
  alternatives: string[];
  execute?: (request: ProductionRequest, stepId: string) => Promise<ProductionArtifact>;
}

export class MistralCopyProducer implements Producer {
  readonly id = "mistral-copy";
  readonly label = "Mistral text";
  readonly capability = "copy.generate" as const;
  readonly connector = "mistral" as const;
  readonly cost = "low" as const;
  readonly quality = "high" as const;
  readonly status = "available" as const;
  readonly alternatives = ["mock"];

  async execute(request: ProductionRequest, stepId: string): Promise<ProductionArtifact> {
    const provider = getAIProvider();
    const prompt = String(request.input?.prompt ?? request.objective ?? request.title).trim();
    const system = String(
      request.input?.system ??
      "Tu es le producteur textuel de Publisher. Retourne un livrable Markdown clair, exploitable et directement relisible."
    );
    const result = await provider.generateText({
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt || "Produis un texte utile en Markdown." },
      ],
      temperature: typeof request.input?.temperature === "number" ? request.input.temperature : 0.5,
      maxTokens: typeof request.input?.maxTokens === "number" ? request.input.maxTokens : 900,
    });
    const content = normalizeMarkdown(result.content, request.title);

    return {
      id: `artifact-${request.id}-${stepId}`,
      requestId: request.id,
      stepId,
      producerId: this.id,
      capability: this.capability,
      type: "markdown",
      title: request.title || "Texte Publisher",
      content,
      url: null,
      downloadUrl: null,
      mimeType: "text/markdown",
      createdAt: nowIso(),
      metadata: {
        provider: result.provider,
        model: result.model,
        isMock: result.isMock,
        status: "completed",
      },
    };
  }
}

export interface ProductionStep {
  id: string;
  capability: ProducerCapability;
  producerId: string | null;
  producerLabel: string | null;
  status: "planned" | "ready" | "blocked" | "unsupported";
  cost: ProductionCost | null;
  quality: ProductionQuality | null;
  connector: Producer["connector"] | null;
  alternatives: string[];
  reason: string;
}

export interface ProductionPlan {
  id: string;
  requestId: string;
  capability: ProducerCapability;
  createdAt: string;
  steps: ProductionStep[];
  status: "ready" | "blocked" | "unsupported";
}

export class ProducerRegistry {
  private readonly producers = new Map<string, Producer>();

  constructor(producers: Producer[] = []) {
    for (const producer of producers) this.register(producer);
  }

  register(producer: Producer): void {
    this.producers.set(producer.id, producer);
  }

  get(producerId: string): Producer | null {
    return this.producers.get(producerId) ?? null;
  }

  list(): Producer[] {
    return [...this.producers.values()];
  }

  byCapability(capability: ProducerCapability): Producer[] {
    return this.list().filter((producer) => producer.capability === capability);
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

export class HtmlLocalProducer implements Producer {
  readonly id = "html-local";
  readonly label = "HTML local";
  readonly capability = "landing-page" as const;
  readonly connector = "local" as const;
  readonly cost = "none" as const;
  readonly quality = "standard" as const;
  readonly status = "available" as const;
  readonly alternatives = ["lovable", "webflow", "framer"];

  async execute(request: ProductionRequest, stepId: string): Promise<ProductionArtifact> {
    const objective = typeof request.objective === "string" && request.objective.trim()
      ? request.objective.trim()
      : "Presenter clairement l'offre et preparer une action mesurable.";
    const headline = request.title.trim() || "Landing page";
    const callToAction = typeof request.input?.callToAction === "string" && request.input.callToAction.trim()
      ? request.input.callToAction.trim()
      : "Demander un rendez-vous";
    const content = [
      `<main class="landing-page">`,
      `  <section class="hero">`,
      `    <h1>${escapeHtml(headline)}</h1>`,
      `    <p>${escapeHtml(objective)}</p>`,
      `    <a href="#contact">${escapeHtml(callToAction)}</a>`,
      `  </section>`,
      `  <section id="contact">`,
      `    <h2>Prochaine etape</h2>`,
      `    <p>Qualifier le besoin, valider l'offre et planifier le premier contact.</p>`,
      `  </section>`,
      `</main>`,
    ].join("\n");

    return {
      id: `artifact-${request.id}-${stepId}`,
      requestId: request.id,
      stepId,
      producerId: this.id,
      capability: this.capability,
      type: "landing-page.html",
      title: headline,
      content,
      url: null,
      downloadUrl: null,
      mimeType: "text/html",
      createdAt: nowIso(),
      metadata: { producer: this.label },
    };
  }
}

export function createDefaultProducerRegistry(): ProducerRegistry {
  return new ProducerRegistry([
    new MistralCopyProducer(),
    new HtmlLocalProducer(),
    {
      id: "canva",
      label: "Canva",
      capability: "social-visual",
      connector: "canva",
      cost: "low",
      quality: "high",
      status: "authorized",
      alternatives: ["ideogram", "gpt-image", "flux"],
    },
    {
      id: "elevenlabs",
      label: "ElevenLabs",
      capability: "voice-over",
      connector: "elevenlabs",
      cost: "medium",
      quality: "high",
      status: "authorized",
      alternatives: [],
    },
    {
      id: "kling",
      label: "Kling",
      capability: "video",
      connector: "kling",
      cost: "medium",
      quality: "high",
      status: "not-configured",
      alternatives: ["runway"],
    },
    {
      id: "metricool",
      label: "Metricool",
      capability: "publish",
      connector: "metricool",
      cost: "low",
      quality: "standard",
      status: "not-configured",
      alternatives: [],
    },
    {
      id: "gmail",
      label: "Gmail",
      capability: "email",
      connector: "gmail",
      cost: "none",
      quality: "standard",
      status: "not-configured",
      alternatives: [],
    },
  ]);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  }[char] ?? char));
}

function normalizeMarkdown(value: string, title: string): string {
  const text = String(value || "").replace(/\\n/g, "\n").trim();
  if (!text) return `# ${title || "Texte Publisher"}\n\nAucun contenu n'a ete retourne par le fournisseur.`;
  return /^#{1,6}\s+/m.test(text) ? text : `# ${title || "Texte Publisher"}\n\n${text}`;
}
