import { logger } from "../lib/logger";
import { getAIProvider } from "../ai/providerRegistry";

export interface GeneratePostDraftInput {
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

const MOCK_POSTS_BY_AGENT: Record<string, Array<{ title: string; content: string; hashtags: string }>> = {
  Natasha: [
    { title: "Annonce officielle — Creature-Sync v2", content: "Chers lecteurs, le Feuch Institute est fier d'annoncer le lancement de Creature-Sync version 2. Cette mise à jour majeure apporte des outils inédits pour l'observation naturaliste augmentée. La science avance. La beauté aussi.", hashtags: "#CreatureSync #FeuchInstitute #Blacklace #Annonce" },
    { title: "Rapport mensuel éditorial — Blacklace", content: "Ce mois-ci, l'Institut a produit 47 publications, traversé 3 univers narratifs et formé 6 agents opérationnels. Les indicateurs sont au vert. Le reste est classifié.", hashtags: "#Blacklace #FeuchInstitute #Rapport" },
  ],
  Marty: [
    { title: "Build Log — Creature-Sync API", content: "Journée de refacto intense. J'ai migré le module d'observation vers une architecture event-driven. Les tests passent à 94%. Les 6% restants impliquent une marmotte. Je reviendrai là-dessus.", hashtags: "#DevLog #GitHub #CreatureSync #Backend" },
    { title: "Coulisses — comment on gère 12 univers en même temps", content: "Spoiler : pas facilement. Mais avec des scripts automatisés, un bon café et une liste de tâches qui s'allonge chaque matin, on y arrive. Je documente tout sur le repo. C'est propre. Presque.", hashtags: "#Coulisses #Dev #Blacklace #Process" },
  ],
  Feuch: [
    { title: "Observation hebdomadaire des bipèdes", content: "Les bipèdes ont encore tenté d'expliquer l'intelligence artificielle à d'autres bipèdes. Le résultat était prévisible. J'ai pris des notes. J'en ferai une monographie comparative. Chapitre 1 : la confiance.", hashtags: "#Feuch #Satire #Bipèdes #Blacklace" },
    { title: "Réflexions d'un cyclope en milieu urbain", content: "Quand on n'a qu'un œil, on choisit mieux ce qu'on regarde. Les bipèdes ont deux yeux et regardent quand même leurs téléphones. Je note. Je conclus. Je n'en parle plus.", hashtags: "#Feuch #Philosophie #Absurde #FeuchInstitute" },
  ],
  Birdy: [
    { title: "Sortie du matin — bois de Boulogne", content: "Mésange bleue observée à 6h47, branche nord du chêne centenaire. Elle chantait en mi bémol. Le vent était complice. Creature-Sync a tout enregistré. Parfois la science ressemble à de la poésie.", hashtags: "#Birdy #CreatureSync #Nature #Ornithologie" },
    { title: "Le retour des hirondelles", content: "Chaque printemps, elles reviennent. Ponctuelles. Silencieuses au premier matin. Puis le ciel se remplit de trajectoires. Creature-Sync note leurs passages. Moi, je respire.", hashtags: "#Birdy #Hirondelles #Nature #Printemps" },
  ],
  Clochette: [
    { title: "Tu peux le faire — message du lundi", content: "Ce lundi comme les autres, tu te demandes peut-être si ça vaut le coup. Oui. Toujours oui. L'Institut est là, les univers sont là, et toi aussi tu es là. C'est déjà quelque chose de bien.", hashtags: "#Clochette #Motivation #FeuchInstitute #Lundi" },
    { title: "Rappel doux pour les créateurs épuisés", content: "Créer c'est fatiguant. C'est aussi ce qui reste. Une page écrite hier existe encore aujourd'hui. C'est plus que rien. Continue.", hashtags: "#Clochette #Créativité #Bienveillance #Blacklace" },
  ],
  Sofia: [
    { title: "Synthèse — L'IA générative dans la création narrative", content: "Après analyse de 47 publications récentes intégrant l'IA, trois tendances émergent : autonomie croissante des agents, hybridation humain-machine des voix narratives, et émergence de nouveaux formats éditoriaux. Le Feuch Institute en est un exemple actif.", hashtags: "#Sofia #IA #Narrative #Analyse #Blacklace" },
    { title: "Documentation — Architecture des univers Blacklace", content: "Les univers Blacklace ne sont pas des franchises. Ce sont des écosystèmes narratifs interconnectés par des personnages, des lieux et des temporalités communes. Ce document en pose les fondations théoriques.", hashtags: "#Sofia #Documentation #Blacklace #Architecture" },
  ],
};

function getMockDraft(input: GeneratePostDraftInput, fallbackReason: string | null): GeneratedDraft {
  const agentPosts = MOCK_POSTS_BY_AGENT[input.agentName];
  const knowledgeSource = input.knowledgeSource ?? "mock";
  const base = !agentPosts || agentPosts.length === 0
    ? {
      title: `Publication — ${input.universe}`,
      content: `Contenu généré pour l'univers ${input.universe} par ${input.agentName}. Mode mock actif — configurez AI_PROVIDER et AI_API_KEY pour une génération réelle.`,
      hashtags: `#${input.universe.replace(/\s+/g, "")} #Blacklace #FeuchInstitute`,
    }
    : agentPosts[Math.floor(Math.random() * agentPosts.length)];
  return {
    ...base,
    isMock: true,
    provider: "mock",
    knowledgeSource,
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

  const knowledgeBlock = input.knowledgeContext
    ? `\n\nContexte issu de la base de connaissances (${knowledgeSource}) :\n${input.knowledgeContext}`
    : "";
  const expertiseBlock = input.expertiseContext
    ? `\n\nExpertises composées par Publisher :\n${input.expertiseContext}\n\nTu synthétises ces expertises dans une seule réponse. Tu ne simules pas une réunion d'agents et tu ne cites pas les profils.`
    : "";

  const systemPrompt = `Tu es ${input.agentName}, une voix éditoriale du Feuch Institute.
Ton ton est : ${input.agentTone}.
Tu crées du contenu pour l'univers ${input.universe} destiné à la plateforme ${input.platform}.${knowledgeBlock}${expertiseBlock}
N'invente aucune preuve, statistique, témoignage ou urgence.
Réponds UNIQUEMENT avec un JSON valide : { "title": "...", "content": "...", "hashtags": "..." }`;
  const userPrompt = input.prompt ?? `Rédige une publication pour ${input.universe} sur ${input.platform}.`;

  try {
    const result = await provider.generateText({
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      temperature: 0.8,
      maxTokens: 600,
    });
    if (result.isMock) return getMockDraft(input, "Le fournisseur IA a répondu en mode mock.");
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
    logger.error({ err, provider: provider.name, agent: input.agentName }, "AI generation failed — falling back to mock");
    return getMockDraft(input, `Échec de l'appel au fournisseur IA (${message}) — repli sur le mode mock.`);
  }
}
