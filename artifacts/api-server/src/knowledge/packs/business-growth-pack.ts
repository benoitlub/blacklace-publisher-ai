import type {
  BusinessGrowthCompatibility,
  BusinessGrowthHistory,
  BusinessGrowthIdentity,
  BusinessGrowthIntelligence,
  BusinessGrowthModule,
  BusinessGrowthRecommendations,
  BusinessGrowthSeed,
  KnowledgePack,
} from "./types";

export const BUSINESS_GROWTH_MODULES: BusinessGrowthModule[] = [
  "prospects",
  "clients",
  "partenaires",
  "fabricants",
  "editeurs",
  "medias",
  "influenceurs",
  "investisseurs",
  "opportunites",
  "campagnes",
  "relances",
];

export const BUSINESS_GROWTH_PROJECTS = [
  "TERRA",
  "Gérard & Gérard",
  "Neverland Ltd",
  "Ilvaard",
  "Blacklace",
  "Pro.Hibited",
  "420 Dice",
  "Octopus Engine",
  "Publisher",
];

const PROJECT_KEYWORDS: Record<string, string[]> = {
  TERRA: ["livre", "roman", "edition", "éditeur", "auteur", "science-fiction", "terra"],
  "Gérard & Gérard": ["gerard", "gérard", "fiction", "aventure", "poulpe", "jeunesse"],
  "Neverland Ltd": ["neverland", "entreprise", "fiction", "satire", "univers"],
  Ilvaard: ["ilvaard", "fantasy", "univers", "jeu de rôle", "jdr"],
  Blacklace: ["blacklace", "studio", "marque", "univers", "édition"],
  "Pro.Hibited": ["prohibited", "pro.hibited", "jeu", "narratif", "cartes"],
  "420 Dice": ["dice", "dés", "jeu", "fabricant", "boutique"],
  "Octopus Engine": ["octopus", "ia", "automation", "orchestration", "developer", "api"],
  Publisher: ["publisher", "publication", "marketing", "contenu", "campagne"],
};

export interface CreateBusinessGrowthSeedInput {
  module: BusinessGrowthModule;
  identity: BusinessGrowthIdentity;
  coordinates?: Partial<BusinessGrowthSeed["coordinates"]>;
  history?: Partial<BusinessGrowthHistory>;
  notes?: string[];
  now?: string;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function collectText(input: CreateBusinessGrowthSeedInput): string {
  return normalize(
    [
      input.identity.nom,
      input.identity.entreprise,
      input.identity.role,
      input.identity.secteur,
      input.identity.pays,
      input.history?.origineContact,
      ...(input.history?.documentsEnvoyes ?? []),
      ...(input.history?.produitsPresentes ?? []),
      ...(input.notes ?? []),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

export function computeBusinessGrowthCompatibility(input: CreateBusinessGrowthSeedInput): BusinessGrowthCompatibility {
  const text = collectText(input);
  const matches = BUSINESS_GROWTH_PROJECTS.filter((project) =>
    PROJECT_KEYWORDS[project]?.some((keyword) => text.includes(normalize(keyword))),
  );

  const projetsCompatibles = matches.length > 0 ? matches : ["Blacklace", "Publisher"];
  return {
    projetsCompatibles,
    rationale: projetsCompatibles.map((project) => `Compatibilité détectée avec ${project} à partir du secteur, du rôle ou de l'historique.`),
  };
}

export function computeBusinessGrowthIntelligence(input: CreateBusinessGrowthSeedInput): BusinessGrowthIntelligence {
  const exchanges = input.history?.echanges ?? [];
  const responses = input.history?.reponsesRecues ?? [];
  const documents = input.history?.documentsEnvoyes ?? [];
  const products = input.history?.produitsPresentes ?? [];
  const latestExchange = exchanges.at(-1)?.date;
  const responseBonus = responses.length > 0 || exchanges.some((exchange) => exchange.responseReceived) ? 20 : 0;
  const historyScore = Math.min(exchanges.length * 8 + documents.length * 4 + products.length * 6, 35);
  const contactScore = input.coordinates?.email || input.coordinates?.site ? 10 : 0;
  const confidence = Math.min(35 + historyScore + contactScore + responseBonus, 100);
  const interest = Math.min(30 + products.length * 12 + responses.length * 10 + (input.notes?.length ?? 0) * 4, 100);
  const reply = Math.min(20 + responseBonus + exchanges.length * 6 + contactScore, 100);
  const conversion = Math.round((interest + reply + confidence) / 3);

  return {
    interetEstime: interest,
    probabiliteReponse: reply,
    probabiliteConversion: conversion,
    derniereActivite: latestExchange ?? input.history?.datePremierContact,
    niveauConfiance: confidence,
    scoreCommercial: Math.round(interest * 0.35 + reply * 0.25 + conversion * 0.25 + confidence * 0.15),
  };
}

export function recommendBusinessGrowthAction(
  compatibility: BusinessGrowthCompatibility,
  intelligence: BusinessGrowthIntelligence,
  history: BusinessGrowthHistory,
): BusinessGrowthRecommendations {
  const primaryProject = compatibility.projetsCompatibles[0];
  const hasResponse = history.reponsesRecues.length > 0 || history.echanges.some((exchange) => exchange.responseReceived);

  return {
    meilleureProchaineAction: hasResponse ? "Préparer une proposition ciblée." : "Envoyer une première prise de contact courte.",
    meilleurMomentRelance: intelligence.probabiliteReponse >= 60 ? "Dans 2 à 3 jours ouvrés." : "La semaine prochaine.",
    produitAProposer: primaryProject,
    tonAEmployer: intelligence.niveauConfiance >= 70 ? "direct, précis, orienté opportunité" : "sobre, curieux, non intrusif",
    documentsAJoindre: primaryProject ? [`Présentation courte ${primaryProject}`] : [],
    anciensEchangesARappeler: history.echanges.slice(-2).map((exchange) => exchange.summary),
  };
}

export function createBusinessGrowthSeed(input: CreateBusinessGrowthSeedInput): BusinessGrowthSeed {
  const now = input.now ?? new Date().toISOString();
  const history: BusinessGrowthHistory = {
    datePremierContact: input.history?.datePremierContact,
    origineContact: input.history?.origineContact,
    echanges: input.history?.echanges ?? [],
    reponsesRecues: input.history?.reponsesRecues ?? [],
    documentsEnvoyes: input.history?.documentsEnvoyes ?? [],
    produitsPresentes: input.history?.produitsPresentes ?? [],
  };
  const compatibility = computeBusinessGrowthCompatibility(input);
  const intelligence = computeBusinessGrowthIntelligence({ ...input, history });

  return {
    id: `business-growth-${normalize([input.identity.entreprise, input.identity.nom].filter(Boolean).join("-")).replace(/[^a-z0-9]+/g, "-")}`,
    module: input.module,
    identity: input.identity,
    coordinates: {
      email: input.coordinates?.email,
      site: input.coordinates?.site,
      reseauxSociaux: input.coordinates?.reseauxSociaux ?? [],
    },
    history,
    compatibility,
    intelligence,
    recommendations: recommendBusinessGrowthAction(compatibility, intelligence, history),
    tags: ["business-growth", input.module, ...compatibility.projetsCompatibles.map((project) => normalize(project).replace(/[^a-z0-9]+/g, "-"))],
    updatedAt: now,
  };
}

export const businessGrowthPack: KnowledgePack = {
  id: "business-growth",
  name: "Business Growth",
  description:
    "Knowledge Package orienté développement commercial. Il transforme contacts, prospects, partenaires et opportunités en Seeds vivantes plutôt qu'en carnet d'adresses classique.",
  universes: BUSINESS_GROWTH_PROJECTS,
  agents: [
    {
      name: "Sofia",
      role: "Business growth analyst",
      tone: "clear, structured, strategic",
      missions: ["Qualifier les contacts", "Prioriser les opportunités", "Préparer les relances"],
      limits: ["Ne pas envoyer de message sans validation humaine", "Ne pas inventer d'historique de contact"],
      examplePhrases: ["Opportunité détectée :", "Prochaine action recommandée :"],
      color: "#16A085",
    },
  ],
  toneRules: [
    "Rester utile, précis et non intrusif.",
    "Toujours distinguer fait observé, hypothèse et recommandation.",
    "Ne jamais présenter une Seed commerciale comme un client acquis.",
  ],
  forbiddenTopics: ["secrets", "données personnelles non autorisées", "envoi automatique sans validation"],
  platforms: ["Gmail", "Notion", "LinkedIn", "Instagram", "Site web", "Publisher"],
  editorialGoals: ["identifier les bons contacts", "préparer les relances", "relier projets et opportunités"],
  hashtags: ["#BusinessGrowth", "#PublisherAI", "#KnowledgeSeed"],
  examples: [
    {
      agentName: "Sofia",
      universe: "TERRA",
      platform: "Gmail",
      title: "Relance éditeur livres",
      content:
        "Trois anciens contacts liés à l'édition semblent compatibles avec TERRA. Préparer une relance courte avec une note de contexte et un extrait.",
      hashtags: "#BusinessGrowth #TERRA #PublisherAI",
    },
  ],
  businessGrowth: {
    modules: BUSINESS_GROWTH_MODULES,
    compatibleProjects: BUSINESS_GROWTH_PROJECTS,
    requiredFields: {
      identite: ["nom", "entreprise", "rôle", "secteur", "pays", "langue"],
      coordonnees: ["email", "site", "réseaux sociaux"],
      historique: ["date du premier contact", "origine du contact", "échanges", "réponses reçues", "documents envoyés", "produits présentés"],
    },
    integrationRules: [
      { source: "radar", behavior: "Détecter les nouveaux signaux commerciaux et proposer des Seeds." },
      { source: "observatoire", behavior: "Comparer contacts, secteurs, projets et opportunités." },
      { source: "memoire", behavior: "Retrouver les anciens échanges et documents déjà envoyés." },
      { source: "seeds", behavior: "Créer ou enrichir une Seed commerciale par contact." },
      { source: "intent", behavior: "Transformer une intention commerciale en piste exploitable." },
      { source: "harvest", behavior: "Relier les livrables produits aux contacts pertinents." },
      { source: "publications", behavior: "Identifier les contacts concernés par une publication ou un projet." },
      { source: "gmail", behavior: "Identifier le contact, retrouver ou créer sa Seed, mettre à jour l'historique et détecter les opportunités." },
      { source: "notion", behavior: "Synchroniser les Seeds commerciales dans les deux sens lorsque le connecteur est configuré." },
    ],
  },
};
