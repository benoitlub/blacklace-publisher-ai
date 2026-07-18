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
    content: `Contenu généré pour l'univers ${input.universe} par ${input.agentName}. Mode mock actif — configurez AI_PROVIDER et AI_API_KEY pour une génération réelle.`,
    hashtags: `#${input.universe.replace(/\s+/g, "")} #Blacklace #FeuchInstitute`,
    isMock: true,
    provider: "mock",
    knowledgeSource: input.knowledgeSource ?? "mock",
    fallbackReason,
    expertiseIds: input.expertiseIds ?? [],
    expertiseRecipeId: input.expertiseRecipeId ?? null,
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
    const lines = cleaned.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const hashtags = lines.filter((line) => line.startsWith("#")).join(" ");
    const content = lines.filter((line) => !line.startsWith("#")).join("\n").trim();
    if (!content) throw new Error("La réponse IA est inutilisable.");
    return { title: lines[0]?.slice(0, 120) || `Publication ${universe}`, content, hashtags, parseWarning: "Le fournisseur n'a pas respecté le format JSON ; son texte a été conservé." };
  }
}

export async function generatePostDraft(input: GeneratePostDraftInput): Promise<GeneratedDraft> {
  const provider = getAIProvider();
  const knowledgeSource = input.knowledgeSource ?? "mock";
  if (provider.name === "mock") return getMockDraft(input, "Aucun fournisseur IA configuré (AI_PROVIDER/MISTRAL_API_KEY absents) — génération en mode mock.");

  const verifiedKnowledge = knowledgeSource === "notion" && Boolean(input.knowledgeContext?.trim());
  const knowledgeBlock = input.knowledgeContext
    ? `\n\nContexte issu de la base de connaissances (${knowledgeSource}) :\n${input.knowledgeContext}`
    : "";
  const expertiseBlock = !verifiedKnowledge && input.expertiseContext
    ? `\n\nExpertises composées par Publisher :\n${input.expertiseContext}\n\nTu synthétises ces expertises dans une seule réponse. Tu ne simules pas une réunion d'agents et tu ne cites pas les profils.`
    : "";

  const identityBlock = verifiedKnowledge
    ? `Tu es le producteur éditorial neutre de Publisher. Tu rédiges uniquement à partir du Knowledge Package vérifié de l'univers ${input.universe}.`
    : `Tu es ${input.agentName}, une voix éditoriale du Feuch Institute.\nTon ton est : ${input.agentTone}.\nTu crées du contenu pour l'univers ${input.universe} destiné à la plateforme ${input.platform}.`;

  const strictRules = verifiedKnowledge
    ? `\nCONTRAT STRICT ENTRE ADAPTATEURS :\n- Le Knowledge Package ci-dessus est la seule source factuelle autorisée.\n- La mission utilisateur peut définir le format, l'audience et l'angle, mais ne constitue pas une source de faits.\n- N'invente aucune citation, aucun prix, aucune disponibilité, aucun canal de vente, aucun personnage, aucune caractéristique, aucun enjeu de société ni aucun appel à l'action factuel.\n- Ne transforme pas une paraphrase en citation et n'utilise jamais de guillemets pour un texte absent des sources.\n- Lorsqu'un élément manque, omets-le simplement.\n- Les expertises, profils et autres univers Blacklace sont exclus de cette génération.`
    : `\nN'invente aucune preuve, statistique, témoignage ou urgence.`;

  const systemPrompt = `${identityBlock}\nTu produis un contenu destiné à la plateforme ${input.platform}.${knowledgeBlock}${expertiseBlock}${strictRules}\nRéponds UNIQUEMENT avec un JSON valide : { "title": "...", "content": "...", "hashtags": "..." }`;
  const userPrompt = input.prompt ?? `Rédige une publication pour ${input.universe} sur ${input.platform}.`;

  logger.info({
    trace: "publisher-mistral",
    traceId: input.traceId,
    stage: "request",
    provider: provider.name,
    knowledgeSource,
    verifiedKnowledge,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  }, "Publisher sent generation request to Mistral");

  try {
    const result = await provider.generateText({
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      temperature: verifiedKnowledge ? 0.2 : 0.8,
      maxTokens: 600,
    });
    if (result.isMock) return getMockDraft(input, "Le fournisseur IA a répondu en mode mock.");

    logger.info({
      trace: "publisher-mistral",
      traceId: input.traceId,
      stage: "raw-response",
      provider: result.provider,
      model: result.model,
      content: result.content,
    }, "Mistral returned generation response");

    const parsed = parseGeneratedDraft(result.content, input.universe);
    return {
      title: parsed.title,
      content: parsed.content,
      hashtags: parsed.hashtags,
      isMock: false,
      provider: result.provider,
      model: result.model,
      knowledgeSource,
      fallbackReason: parsed.parseWarning,
      expertiseIds: input.expertiseIds ?? [],
      expertiseRecipeId: input.expertiseRecipeId ?? null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue lors de l'appel au fournisseur IA";
    logger.error({ err, traceId: input.traceId, provider: provider.name, agent: input.agentName }, "AI generation failed — falling back to mock");
    return getMockDraft(input, `Échec de l'appel au fournisseur IA (${message}) — repli sur le mode mock.`);
  }
}
