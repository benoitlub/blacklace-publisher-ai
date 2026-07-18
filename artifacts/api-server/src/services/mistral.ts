import { logger } from "../lib/logger";
import { getAIProvider } from "../ai/providerRegistry";

export interface GeneratePostDraftInput {
  traceId?: string;
  universe: string;
  agentName: string;
  agentTone: string;
  platform: string;
  prompt?: string;
  knowledgeContext?: string;
  knowledgeSource?: "notion" | "mock";
  expertiseContext?: string;
  expertiseIds?: readonly string[];
  expertiseRecipeId?: string;
}

export interface GeneratedDraft {
  title: string;
  content: string;
  hashtags: string;
  isMock: boolean;
  provider: string;
  model?: string;
  knowledgeSource: "notion" | "mock";
  fallbackReason: string | null;
  expertiseIds: readonly string[];
  expertiseRecipeId: string | null;
}

function getMockDraft(input: GeneratePostDraftInput, fallbackReason: string | null): GeneratedDraft {
  return {
    title: `Publication — ${input.universe}`,
    content: `Aucun contenu réel n'a été produit pour ${input.universe}.`,
    hashtags: "",
    isMock: true,
    provider: "mock",
    knowledgeSource: input.knowledgeSource ?? "mock",
    fallbackReason,
    expertiseIds: [],
    expertiseRecipeId: null,
  };
}

function parseGeneratedDraft(raw: string, universe: string): { title: string; content: string; hashtags: string; parseWarning: string | null } {
  const cleaned = raw.replace(/```(?:json)?\n?/g, "").trim();
  if (!cleaned) throw new Error("Le fournisseur IA n'a retourné aucun contenu.");
  try {
    const parsed = JSON.parse(cleaned) as { title?: string; content?: string; hashtags?: string };
    const content = String(parsed.content || "").trim();
    if (!content) throw new Error("Le JSON du fournisseur ne contient aucun contenu.");
    return { title: String(parsed.title || `Publication ${universe}`).trim(), content, hashtags: String(parsed.hashtags || "").trim(), parseWarning: null };
  } catch (_) {
    const objectMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        const parsed = JSON.parse(objectMatch[0]) as { title?: string; content?: string; hashtags?: string };
        const content = String(parsed.content || "").trim();
        if (content) return { title: String(parsed.title || `Publication ${universe}`).trim(), content, hashtags: String(parsed.hashtags || "").trim(), parseWarning: "Le fournisseur a entouré le JSON de texte supplémentaire." };
      } catch (_) {}
    }
    throw new Error("Le fournisseur n'a pas respecté le contrat JSON.");
  }
}

export async function generatePostDraft(input: GeneratePostDraftInput): Promise<GeneratedDraft> {
  const provider = getAIProvider();
  const knowledgeSource = input.knowledgeSource ?? "mock";
  const verifiedKnowledge = knowledgeSource === "notion" && Boolean(input.knowledgeContext?.trim());
  if (provider.name === "mock") return getMockDraft(input, "Aucun fournisseur IA configuré.");

  const systemPrompt = verifiedKnowledge
    ? [
      "Tu es le producteur textuel neutre de Publisher.",
      "Transforme fidèlement la source en livrable demandé.",
      "La source est l'unique autorité factuelle.",
      "La mission définit seulement le format, l'audience et l'angle.",
      "N'invente aucun fait, prix, citation, disponibilité, personnage, bénéfice, cible ou appel à l'action factuel.",
      "Quand une information manque, omets-la.",
      "Ne transforme jamais une paraphrase en citation.",
      "Réponds uniquement avec un JSON valide : { \"title\": \"...\", \"content\": \"...\", \"hashtags\": \"...\" }",
    ].join("\n")
    : [
      `Tu es ${input.agentName}.`,
      `Ton ton est : ${input.agentTone}.`,
      `Tu produis un contenu pour ${input.platform}.`,
      "N'invente aucune preuve, statistique, témoignage ou urgence.",
      "Réponds uniquement avec un JSON valide : { \"title\": \"...\", \"content\": \"...\", \"hashtags\": \"...\" }",
    ].join("\n");

  const userPrompt = verifiedKnowledge
    ? `MISSION\n${input.prompt ?? `Rédige un contenu pour ${input.platform}.`}\n\nSOURCE UNIQUE\n${input.knowledgeContext}`
    : input.prompt ?? `Rédige une publication pour ${input.universe} sur ${input.platform}.`;

  logger.info({
    trace: "publisher-mistral",
    traceId: input.traceId,
    stage: "request",
    universe: input.universe,
    platform: input.platform,
    knowledgeSource,
    verifiedKnowledge,
    systemLength: systemPrompt.length,
    userLength: userPrompt.length,
  }, "Mistral generation request prepared");

  try {
    const result = await provider.generateText({
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      temperature: verifiedKnowledge ? 0.1 : 0.8,
      maxTokens: 600,
    });
    if (result.isMock) return getMockDraft(input, "Le fournisseur IA a répondu en mode mock.");
    const parsed = parseGeneratedDraft(result.content, input.universe);
    logger.info({
      trace: "publisher-mistral",
      traceId: input.traceId,
      stage: "response",
      provider: result.provider,
      model: result.model,
      contentLength: parsed.content.length,
      parseWarning: parsed.parseWarning,
    }, "Mistral generation response parsed");
    return {
      title: parsed.title,
      content: parsed.content,
      hashtags: parsed.hashtags,
      isMock: false,
      provider: result.provider,
      model: result.model,
      knowledgeSource,
      fallbackReason: parsed.parseWarning,
      expertiseIds: [],
      expertiseRecipeId: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue lors de l'appel au fournisseur IA";
    logger.error({ err, traceId: input.traceId, provider: provider.name }, "AI generation failed");
    return getMockDraft(input, `Échec de l'appel au fournisseur IA (${message}).`);
  }
}
