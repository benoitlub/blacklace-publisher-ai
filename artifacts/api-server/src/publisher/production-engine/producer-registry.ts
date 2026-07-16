export type ProducerCapability =
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
  connector: "local" | "canva" | "elevenlabs" | "kling" | "metricool" | "gmail";
  cost: ProductionCost;
  quality: ProductionQuality;
  status: ProducerStatus;
  alternatives: string[];
  execute?: (request: ProductionRequest, stepId: string) => Promise<ProductionArtifact>;
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

function textInput(input: Record<string, unknown> | undefined, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = input?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

function listInput(input: Record<string, unknown> | undefined, keys: string[], fallback: string[]): string[] {
  for (const key of keys) {
    const value = input?.[key];
    if (Array.isArray(value)) {
      const items = value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
      if (items.length) return items.slice(0, 6);
    }
  }
  return fallback;
}

function safeUrl(value: string): string {
  if (!value) return "#contact";
  if (/^(https?:|mailto:|tel:|#)/i.test(value)) return value;
  return "#contact";
}

export class HtmlLocalProducer implements Producer {
  readonly id = "html-local";
  readonly label = "HTML local enrichi";
  readonly capability = "landing-page" as const;
  readonly connector = "local" as const;
  readonly cost = "none" as const;
  readonly quality = "high" as const;
  readonly status = "available" as const;
  readonly alternatives = ["lovable", "webflow", "framer"];

  async execute(request: ProductionRequest, stepId: string): Promise<ProductionArtifact> {
    const input = request.input;
    const headline = textInput(input, ["headline", "title", "projectName"], request.title.trim() || "Une proposition à découvrir");
    const eyebrow = textInput(input, ["eyebrow", "category", "universe"], "Une création indépendante");
    const objective = request.objective?.trim() || textInput(input, ["objective", "promise", "description"], "Découvrez une proposition singulière, pensée pour offrir une expérience claire et mémorable.");
    const audience = textInput(input, ["audience", "targetAudience"], "Pour les curieux, les lecteurs et les partenaires à la recherche d’une expérience originale.");
    const offer = textInput(input, ["offer", "product", "service"], "Une création prête à être découverte, partagée ou proposée à votre public.");
    const price = textInput(input, ["price", "offerPrice"], "");
    const callToAction = textInput(input, ["callToAction", "cta", "buttonLabel"], price ? `Découvrir — ${price}` : "Découvrir le projet");
    const secondaryCta = textInput(input, ["secondaryCallToAction", "secondaryCta"], "En savoir plus");
    const actionUrl = safeUrl(textInput(input, ["url", "actionUrl", "purchaseUrl", "projectUrl"], "#contact"));
    const contactUrl = safeUrl(textInput(input, ["contactUrl", "email", "contact"], "#contact"));
    const benefits = listInput(input, ["benefits", "features", "highlights"], [
      "Une proposition compréhensible en quelques secondes",
      "Un univers identifiable et une promesse concrète",
      "Une prochaine action simple, sans parcours labyrinthique",
    ]);
    const steps = listInput(input, ["steps", "nextSteps"], [
      "Découvrez la proposition et vérifiez qu’elle vous correspond.",
      "Consultez les détails utiles avant de vous décider.",
      "Passez à l’action ou prenez contact simplement.",
    ]);
    const proof = textInput(input, ["proof", "credibility", "authorNote"], "Projet indépendant présenté sans chiffres, témoignages ni promesses inventées.");
    const footer = textInput(input, ["footer", "brand"], "Produit avec Blacklace Publisher");

    const benefitCards = benefits.map((benefit, index) => `
          <article class="card">
            <span class="number">0${index + 1}</span>
            <p>${escapeHtml(benefit)}</p>
          </article>`).join("");
    const stepCards = steps.map((step, index) => `
          <li><span>${index + 1}</span><p>${escapeHtml(step)}</p></li>`).join("");

    const content = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(objective.slice(0, 155))}">
  <title>${escapeHtml(headline)}</title>
  <style>
    :root{color-scheme:dark;--bg:#0d0d12;--panel:#171720;--line:#30303c;--text:#f7f4ee;--muted:#b8b3bd;--accent:#ff6542;--accent2:#9e70ff;--max:1120px}
    *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:radial-gradient(circle at 80% 0,#291b3e 0,transparent 33%),radial-gradient(circle at 0 30%,#302018 0,transparent 28%),var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.6}
    a{color:inherit}.wrap{width:min(calc(100% - 32px),var(--max));margin:auto}.topbar{display:flex;justify-content:space-between;align-items:center;padding:22px 0;font-size:.78rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--accent);margin-right:9px;box-shadow:0 0 18px var(--accent)}
    .hero{min-height:76vh;display:grid;align-items:center;padding:72px 0 96px}.hero-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(280px,.65fr);gap:48px;align-items:end}.eyebrow{color:var(--accent);font-weight:800;text-transform:uppercase;letter-spacing:.18em;font-size:.78rem}.hero h1{font-family:Georgia,"Times New Roman",serif;font-size:clamp(3rem,8vw,7.4rem);line-height:.92;letter-spacing:-.055em;margin:18px 0 28px;max-width:920px}.lead{font-size:clamp(1.1rem,2vw,1.45rem);color:var(--muted);max-width:720px}.actions{display:flex;gap:14px;flex-wrap:wrap;margin-top:34px}.button{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:0 24px;border-radius:999px;text-decoration:none;font-weight:800;border:1px solid var(--accent);background:var(--accent);color:#160b08}.button.secondary{background:transparent;color:var(--text);border-color:var(--line)}.offer{padding:26px;border:1px solid var(--line);border-radius:24px;background:linear-gradient(145deg,rgba(255,255,255,.07),rgba(255,255,255,.02));box-shadow:0 30px 80px rgba(0,0,0,.28)}.offer small{color:var(--muted);text-transform:uppercase;letter-spacing:.16em}.offer strong{display:block;font-family:Georgia,serif;font-size:1.8rem;line-height:1.15;margin:14px 0}.price{color:var(--accent);font-size:1.1rem;font-weight:800}
    section{padding:84px 0;border-top:1px solid var(--line)}.section-head{display:grid;grid-template-columns:.65fr 1.35fr;gap:32px;margin-bottom:38px}.section-head h2{font-family:Georgia,serif;font-size:clamp(2.2rem,5vw,4.2rem);line-height:1;margin:0}.section-head p{color:var(--muted);font-size:1.1rem;margin:0}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.card{min-height:190px;padding:24px;border-radius:22px;border:1px solid var(--line);background:var(--panel)}.number{color:var(--accent2);font-family:monospace;font-size:.82rem}.card p{font-size:1.1rem;margin:38px 0 0}.steps{list-style:none;padding:0;margin:0;display:grid;gap:14px}.steps li{display:grid;grid-template-columns:52px 1fr;gap:20px;align-items:center;padding:18px 20px;border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.025)}.steps span{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:var(--accent2);color:#120d19;font-weight:900}.steps p{margin:0}.proof{margin-top:28px;color:var(--muted);font-size:.9rem}.final{padding:96px 0;text-align:center}.final h2{font-family:Georgia,serif;font-size:clamp(2.4rem,6vw,5rem);line-height:1;margin:0 auto 22px;max-width:850px}.final p{color:var(--muted);max-width:680px;margin:0 auto 28px}footer{padding:32px 0 44px;border-top:1px solid var(--line);color:var(--muted);font-size:.85rem}
    @media(max-width:780px){.hero{padding:46px 0 72px}.hero-grid,.section-head{grid-template-columns:1fr}.hero-grid{gap:34px}.cards{grid-template-columns:1fr}.topbar{align-items:flex-start;gap:12px}.button{width:100%}.offer{padding:22px}.hero h1{font-size:clamp(3rem,16vw,5.4rem)}}
  </style>
</head>
<body>
  <header class="wrap topbar"><span><i class="dot"></i>${escapeHtml(eyebrow)}</span><span>${escapeHtml(headline)}</span></header>
  <main>
    <section class="hero">
      <div class="wrap hero-grid">
        <div>
          <p class="eyebrow">${escapeHtml(eyebrow)}</p>
          <h1>${escapeHtml(headline)}</h1>
          <p class="lead">${escapeHtml(objective)}</p>
          <div class="actions">
            <a class="button" href="${escapeHtml(actionUrl)}">${escapeHtml(callToAction)}</a>
            <a class="button secondary" href="#details">${escapeHtml(secondaryCta)}</a>
          </div>
        </div>
        <aside class="offer">
          <small>La proposition</small>
          <strong>${escapeHtml(offer)}</strong>
          <p>${escapeHtml(audience)}</p>
          ${price ? `<p class="price">${escapeHtml(price)}</p>` : ""}
        </aside>
      </div>
    </section>
    <section id="details">
      <div class="wrap">
        <div class="section-head"><h2>Pourquoi regarder de plus près ?</h2><p>${escapeHtml(audience)}</p></div>
        <div class="cards">${benefitCards}
        </div>
      </div>
    </section>
    <section>
      <div class="wrap">
        <div class="section-head"><h2>La suite, sans brouillard.</h2><p>Un parcours court et compréhensible pour passer de la découverte à une décision utile.</p></div>
        <ol class="steps">${stepCards}
        </ol>
        <p class="proof">${escapeHtml(proof)}</p>
      </div>
    </section>
    <section class="final" id="contact">
      <div class="wrap">
        <h2>${escapeHtml(callToAction)}</h2>
        <p>${escapeHtml(objective)}</p>
        <a class="button" href="${escapeHtml(contactUrl === "#contact" ? actionUrl : contactUrl)}">${escapeHtml(callToAction)}</a>
      </div>
    </section>
  </main>
  <footer><div class="wrap">${escapeHtml(footer)} · ${new Date().getFullYear()}</div></footer>
</body>
</html>`;

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
      mimeType: "text/html; charset=utf-8",
      createdAt: nowIso(),
      metadata: {
        producer: this.label,
        template: "publisher-rich-landing-v2",
        responsive: true,
        selfContained: true,
        sections: ["hero", "offer", "benefits", "steps", "cta"],
      },
    };
  }
}

export function createDefaultProducerRegistry(): ProducerRegistry {
  return new ProducerRegistry([
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
