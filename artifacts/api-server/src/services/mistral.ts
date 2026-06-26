import { logger } from "../lib/logger";
import { getAIProvider } from "../ai/providerRegistry";

export interface GeneratePostDraftInput {
  universe: string;
  agentName: string;
  agentTone: string;
  platform: string;
  prompt?: string;
}

export interface GeneratedDraft {
  title: string;
  content: string;
  hashtags: string;
  isMock: boolean;
  provider?: string;
  model?: string;
}

const MOCK_POSTS_BY_AGENT: Record<string, Array<{ title: string; content: string; hashtags: string }>> = {
  Natasha: [
    {
      title: "Annonce officielle — Creature-Sync v2",
      content:
        "Chers lecteurs, le Feuch Institute est fier d'annoncer le lancement de Creature-Sync version 2. Cette mise à jour majeure apporte des outils inédits pour l'observation naturaliste augmentée. La science avance. La beauté aussi.",
      hashtags: "#CreatureSync #FeuchInstitute #Blacklace #Annonce",
    },
    {
      title: "Rapport mensuel éditorial — Blacklace",
      content:
        "Ce mois-ci, l'Institut a produit 47 publications, traversé 3 univers narratifs et formé 6 agents opérationnels. Les indicateurs sont au vert. Le reste est classifié.",
      hashtags: "#Blacklace #FeuchInstitute #Rapport",
    },
  ],
  Marty: [
    {
      title: "Build Log — Creature-Sync API",
      content:
        "Journée de refacto intense. J'ai migré le module d'observation vers une architecture event-driven. Les tests passent à 94%. Les 6% restants impliquent une marmotte. Je reviendrai là-dessus.",
      hashtags: "#DevLog #GitHub #CreatureSync #Backend",
    },
    {
      title: "Coulisses — comment on gère 12 univers en même temps",
      content:
        "Spoiler : pas facilement. Mais avec des scripts automatisés, un bon café et une liste de tâches qui s'allonge chaque matin, on y arrive. Je documente tout sur le repo. C'est propre. Presque.",
      hashtags: "#Coulisses #Dev #Blacklace #Process",
    },
  ],
  Feuch: [
    {
      title: "Observation hebdomadaire des bipèdes",
      content:
        "Les bipèdes ont encore tenté d'expliquer l'intelligence artificielle à d'autres bipèdes. Le résultat était prévisible. J'ai pris des notes. J'en ferai une monographie comparative. Chapitre 1 : la confiance.",
      hashtags: "#Feuch #Satire #Bipèdes #Blacklace",
    },
    {
      title: "Réflexions d'un cyclope en milieu urbain",
      content:
        "Quand on n'a qu'un œil, on choisit mieux ce qu'on regarde. Les bipèdes ont deux yeux et regardent quand même leurs téléphones. Je note. Je conclus. Je n'en parle plus.",
      hashtags: "#Feuch #Philosophie #Absurde #FeuchInstitute",
    },
  ],
  Birdy: [
    {
      title: "Sortie du matin — bois de Boulogne",
      content:
        "Mésange bleue observée à 6h47, branche nord du chêne centenaire. Elle chantait en mi bémol. Le vent était complice. Creature-Sync a tout enregistré. Parfois la science ressemble à de la poésie.",
      hashtags: "#Birdy #CreatureSync #Nature #Ornithologie",
    },
    {
      title: "Le retour des hirondelles",
      content:
        "Chaque printemps, elles reviennent. Ponctuelles. Silencieuses au premier matin. Puis le ciel se remplit de trajectoires. Creature-Sync note leurs passages. Moi, je respire.",
      hashtags: "#Birdy #Hirondelles #Nature #Printemps",
    },
  ],
  Clochette: [
    {
      title: "Tu peux le faire — message du lundi",
      content:
        "Ce lundi comme les autres, tu te demandes peut-être si ça vaut le coup. Oui. Toujours oui. L'Institut est là, les univers sont là, et toi aussi tu es là. C'est déjà quelque chose de bien.",
      hashtags: "#Clochette #Motivation #FeuchInstitute #Lundi",
    },
    {
      title: "Rappel doux pour les créateurs épuisés",
      content:
        "Créer c'est fatiguant. C'est aussi ce qui reste. Une page écrite hier existe encore aujourd'hui. C'est plus que rien. Continue.",
      hashtags: "#Clochette #Créativité #Bienveillance #Blacklace",
    },
  ],
  Sofia: [
    {
      title: "Synthèse — L'IA générative dans la création narrative",
      content:
        "Après analyse de 47 publications récentes intégrant l'IA, trois tendances émergent : autonomie croissante des agents, hybridation humain-machine des voix narratives, et émergence de nouveaux formats éditoriaux. Le Feuch Institute en est un exemple actif.",
      hashtags: "#Sofia #IA #Narrative #Analyse #Blacklace",
    },
    {
      title: "Documentation — Architecture des univers Blacklace",
      content:
        "Les univers Blacklace ne sont pas des franchises. Ce sont des écosystèmes narratifs interconnectés par des personnages, des lieux et des temporalités communes. Ce document en pose les fondations théoriques.",
      hashtags: "#Sofia #Documentation #Blacklace #Architecture",
    },
  ],
};

function getMockDraft(input: GeneratePostDraftInput): GeneratedDraft {
  const agentPosts = MOCK_POSTS_BY_AGENT[input.agentName];
  if (!agentPosts || agentPosts.length === 0) {
    return {
      title: `Publication — ${input.universe}`,
      content: `Contenu généré pour l'univers ${input.universe} par ${input.agentName}. Mode mock actif — configurez AI_PROVIDER et AI_API_KEY pour une génération réelle.`,
      hashtags: `#${input.universe.replace(/\s+/g, "")} #Blacklace #FeuchInstitute`,
      isMock: true,
    };
  }
  const post = agentPosts[Math.floor(Math.random() * agentPosts.length)];
  return { ...post, isMock: true };
}

export async function generatePostDraft(input: GeneratePostDraftInput): Promise<GeneratedDraft> {
  const provider = getAIProvider();

  const systemPrompt = `Tu es ${input.agentName}, un agent éditorial du Feuch Institute.
Ton ton est : ${input.agentTone}.
Tu crées du contenu pour l'univers ${input.universe} destiné à la plateforme ${input.platform}.
Réponds UNIQUEMENT avec un JSON valide : { "title": "...", "content": "...", "hashtags": "..." }`;

  const userPrompt = input.prompt ?? `Rédige une publication pour ${input.universe} sur ${input.platform}.`;

  try {
    const result = await provider.generateText({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.8,
      maxTokens: 600,
    });

    if (result.isMock) {
      logger.info({ agent: input.agentName, provider: provider.name }, "AI in mock mode — using curated draft");
      return getMockDraft(input);
    }

    const json = result.content.replace(/```(?:json)?\n?/g, "").trim();
    const parsed = JSON.parse(json) as { title?: string; content?: string; hashtags?: string };

    return {
      title: parsed.title ?? `Publication ${input.universe}`,
      content: parsed.content ?? result.content,
      hashtags: parsed.hashtags ?? "",
      isMock: false,
      provider: result.provider,
      model: result.model,
    };
  } catch (err) {
    logger.error({ err, provider: provider.name, agent: input.agentName }, "AI generation failed — falling back to mock");
    return getMockDraft(input);
  }
}
