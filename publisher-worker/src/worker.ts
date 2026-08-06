import { Hono } from "hono";
import { cors } from "hono/cors";

type Env = {
  MISTRAL_API_KEY?: string;
  AI_API_KEY?: string;
  MISTRAL_MODEL?: string;
};

const app = new Hono<{ Bindings: Env }>();
app.use("*", cors());

app.get("/api/health", (c) => c.json({ status: "ok", service: "blacklace-publisher-worker" }));

function safeContent(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value.map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part) return (part as any).text;
      return "";
    }).filter(Boolean).join("\n").trim();
  }
  return "";
}

async function executeMistralText(env: Env, request: { title: string; prompt: string; systemPrompt?: string; maxTokens?: number; temperature?: number }) {
  const key = (env.AI_API_KEY || env.MISTRAL_API_KEY || "").trim();
  if (!key) throw new Error("Mistral n'est pas configuré dans Publisher.");
  if (!request.prompt.trim()) throw new Error("Le prompt Mistral est vide.");
  const model = (env.MISTRAL_MODEL || "mistral-small-latest").trim();

  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      model,
      temperature: Number.isFinite(request.temperature) ? request.temperature : 0.25,
      max_tokens: Number.isFinite(request.maxTokens) ? request.maxTokens : 5000,
      messages: [
        { role: "system", content: request.systemPrompt?.trim() || "Tu es le producteur textuel de Blacklace Publisher. Produis le livrable demandé, complet, factuel et directement exploitable. N'invente aucune donnée réelle manquante." },
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
    metadata: { provider: "mistral", model, finishReason: choice?.finish_reason ?? null, usage: payload.usage ?? null },
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" } as Record<string, string>)[char] ?? char);
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

function generateLandingPage(request: { title?: string; input?: Record<string, unknown> }) {
  const input = request.input ?? {};
  const headline = textInput(input, ["headline", "title", "projectName"], request.title?.trim() || "Une proposition à découvrir");
  const eyebrow = textInput(input, ["eyebrow", "category", "universe"], "Une création indépendante");
  const objective = textInput(input, ["objective", "promise", "description"], "Découvrez une proposition singulière, pensée pour offrir une expérience claire et mémorable.");
  const audience = textInput(input, ["audience", "targetAudience"], "Pour les curieux, les lecteurs et les partenaires à la recherche d'une expérience originale.");
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
    "Découvrez la proposition et vérifiez qu'elle vous correspond.",
    "Consultez les détails utiles avant de vous décider.",
    "Passez à l'action ou prenez contact simplement.",
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
    id: `artifact-${Date.now()}`,
    type: "landing-page.html",
    title: headline,
    content,
    url: null,
    downloadUrl: null,
    mimeType: "text/html; charset=utf-8",
    createdAt: new Date().toISOString(),
    metadata: { producer: "HTML local enrichi", template: "publisher-rich-landing-v2", responsive: true, selfContained: true, sections: ["hero", "offer", "benefits", "steps", "cta"] },
  };
}

function isCopyExecution(tool: string, action: string, body: Record<string, unknown>): boolean {
  const capability = String(body.capability ?? body.type ?? "").toLowerCase();
  return tool === "mistral" || action === "generate_text" || action === "copy.generate" || capability === "copy.generate" || capability === "copy" || capability === "text-document";
}

app.post("/api/production/execute", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, any>;
  const tool = String(body.tool ?? "").toLowerCase();
  const action = String(body.action ?? "").toLowerCase();

  try {
    if (isCopyExecution(tool, action, body)) {
      const input = body.input ?? {};
      const title = (input.title ?? body.title ?? "Livrable textuel Publisher") as string;
      const prompt = (input.prompt ?? body.prompt ?? input.objective ?? body.objective ?? "") as string;
      if (!prompt.trim()) return c.json({ status: "failed", code: "PROMPT_REQUIRED", error: "Un prompt est requis pour copy.generate." }, 400);
      const artifact = await executeMistralText(c.env, {
        title,
        prompt,
        systemPrompt: input.systemPrompt ?? body.systemPrompt,
        maxTokens: Number(input.maxTokens ?? body.maxTokens ?? 5000),
        temperature: Number(input.temperature ?? body.temperature ?? 0.25),
      });
      return c.json({ status: "completed", provider: "mistral", tool: "mistral", action: "copy.generate", artifact });
    }

    const capability = String(body.capability ?? body.type ?? tool).toLowerCase();
    if (["html", "html-local", "landing", "landing-page"].includes(capability) || tool === "html-local" || action.includes("landing")) {
      const artifact = generateLandingPage({ title: body.title, input: body.input });
      return c.json({ status: "completed", provider: "production-engine", tool: "html-local", action: "HTML_LOCAL_LANDING_PAGE", artifact });
    }

    return c.json({ status: "failed", code: "PRODUCER_NOT_IMPLEMENTED", error: `Le producteur ${tool || "inconnu"}/${action || "action inconnue"} n'a pas encore d'exécuteur validé sur ce Worker (Canva/Composio pas encore porté).` }, 400);
  } catch (error) {
    return c.json({ status: "failed", code: "PRODUCTION_PROVIDER_ERROR", error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

export default app;
