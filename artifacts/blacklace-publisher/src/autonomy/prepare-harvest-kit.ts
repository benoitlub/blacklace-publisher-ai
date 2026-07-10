import { buildGreenhouse } from "@/knowledge/build-greenhouse";
import { loadObservationMemory } from "@/memory/observation-memory";

export interface HarvestKit {
  id: string;
  generatedAt: string;
  sourceTitle: string;
  promise: string;
  offer: string;
  salesPage: string;
  linkedinPost: string;
  facebookPost: string;
  shortPost: string;
  directMessage: string;
  visualPrompt: string;
  videoStoryboard: string;
  blockingPoints: string[];
  provider: string;
}

interface GatewayResponse {
  ok: boolean;
  provider?: string;
  output?: string;
  error?: string;
}

function stripFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
}

function fallbackKit(title: string, signals: string[]): HarvestKit {
  const signalText = signals.slice(0, 4).join(", ") || "création existante du jardin Blacklace";
  return {
    id: `harvest-${Date.now().toString(36)}`,
    generatedAt: new Date().toISOString(),
    sourceTitle: title,
    promise: `Découvrir ${title} simplement, sans promesse gonflée ni nouvelle prestation à produire.`,
    offer: `${title} — une création déjà existante, présentée clairement et prête à être découverte.`,
    salesPage: `${title}\n\nUne création de Benoît déjà disponible.\n\nCe que vous y trouverez : ${signalText}.\n\nPourquoi maintenant : la création existe déjà ; cette page sert à la rendre compréhensible en quelques secondes.`,
    linkedinPost: `J'ai créé ${title}. Plutôt que d'en parler comme d'un concept, voici ce que cette création permet réellement : ${signalText}. Je la remets aujourd'hui au centre du jardin Blacklace.`,
    facebookPost: `${title} est déjà là. Je lui redonne simplement une place visible : ${signalText}.`,
    shortPost: `${title} existe déjà. Aujourd'hui, je le rends enfin visible.`,
    directMessage: `Bonjour, je pense que ${title} pourrait vous intéresser. Je peux vous envoyer une présentation très courte et le lien direct.`,
    visualPrompt: `Visuel vertical clair et authentique pour présenter ${title}, esthétique Blacklace, sujet immédiatement compréhensible, sans faux témoignage ni urgence artificielle.`,
    videoStoryboard: `Plan 1 : le problème ou la curiosité. Plan 2 : ${title} en situation. Plan 3 : une preuve concrète. Plan 4 : appel à découvrir, sans survente.`,
    blockingPoints: ["Vérifier le lien public", "Vérifier le paiement ou le téléchargement", "Choisir une image réelle de la création"],
    provider: "local-fallback",
  };
}

export async function prepareHarvestKit(): Promise<HarvestKit> {
  const report = buildGreenhouse(loadObservationMemory());
  const mature = report.clusters.filter((cluster) => cluster.maturity === "plante" || cluster.maturity === "arbre");
  const chosen = mature[0] ?? report.clusters[0];
  const title = chosen?.title ?? "une création existante de Benoît";
  const signals = chosen?.signals ?? [];
  const fallback = fallbackKit(title, signals);

  const prompt = `Tu es Gérard, le poulpe jardinier de Benoît. Prépare une récolte de niveau 2 à partir d'une création EXISTANTE. Tu ne dois inventer ni audit, ni prestation, ni nouvelle corvée pour Benoît.\n\nCréation choisie : ${title}\nSignaux disponibles : ${signals.join(" | ") || "aucun signal détaillé"}\n\nRetourne uniquement un objet JSON valide avec ces clés : promise, offer, salesPage, linkedinPost, facebookPost, shortPost, directMessage, visualPrompt, videoStoryboard, blockingPoints.\n\nRègles : ton naturel, factuel, pas de fausse urgence, pas de promesse de revenus, pas de manipulation. Tout doit être prêt à valider et réutilisable immédiatement.`;

  try {
    const response = await fetch("/api/ai-gateway/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: "text.summary",
        prompt,
        system: "Réponds uniquement en JSON strict. Prépare, ne conseille pas vaguement.",
        universe: "Blacklace",
        agent: "Gerard",
        preferredProvider: "mistral",
        maxTokens: 2200,
        temperature: 0.45,
      }),
    });

    if (!response.ok) return fallback;
    const gateway = (await response.json()) as GatewayResponse;
    if (!gateway.ok || !gateway.output) return fallback;

    const parsed = JSON.parse(stripFence(gateway.output)) as Partial<HarvestKit>;
    return {
      ...fallback,
      ...parsed,
      id: fallback.id,
      generatedAt: fallback.generatedAt,
      sourceTitle: title,
      blockingPoints: Array.isArray(parsed.blockingPoints) ? parsed.blockingPoints.filter(Boolean) : fallback.blockingPoints,
      provider: gateway.provider ?? "ai-gateway",
    };
  } catch {
    return fallback;
  }
}
