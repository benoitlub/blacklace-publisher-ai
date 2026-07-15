export interface ExpertiseProfile {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly criteria: readonly string[];
  readonly avoid: readonly string[];
  readonly keywords: readonly string[];
}

export interface ExpertiseSelectionInput {
  readonly universe: string;
  readonly platform: string;
  readonly prompt?: string;
}

export interface ExpertiseSelection {
  readonly profiles: readonly ExpertiseProfile[];
  readonly recipeId: string;
  readonly rationale: readonly string[];
  readonly promptBlock: string;
}

const PROFILES: readonly ExpertiseProfile[] = [
  {
    id: "branding",
    label: "Mentor branding",
    description: "Clarifie la promesse, la personnalité, la cohérence et la différence perçue.",
    criteria: ["promesse mémorable", "cohérence avec l'univers", "différenciation claire"],
    avoid: ["slogans génériques", "surpromesse", "rupture de ton"],
    keywords: ["marque", "branding", "identité", "positionnement", "univers", "campagne"],
  },
  {
    id: "seo",
    label: "Expert SEO",
    description: "Structure le contenu autour d'une intention de recherche réelle et d'un vocabulaire naturel.",
    criteria: ["intention explicite", "champ lexical utile", "titre compréhensible"],
    avoid: ["bourrage de mots-clés", "titre trompeur", "jargon vide"],
    keywords: ["seo", "google", "site", "article", "amazon", "kdp", "recherche"],
  },
  {
    id: "marketing",
    label: "Stratège marketing",
    description: "Relie audience, problème, preuve, offre et action attendue.",
    criteria: ["audience identifiable", "bénéfice concret", "appel à l'action proportionné"],
    avoid: ["faux sentiment d'urgence", "chiffres inventés", "promesse magique"],
    keywords: ["vente", "marketing", "conversion", "lancement", "offre", "client", "campagne"],
  },
  {
    id: "storytelling",
    label: "Mentor storytelling",
    description: "Transforme une information en scène, tension ou trajectoire sans trahir les faits.",
    criteria: ["accroche narrative", "progression lisible", "émotion cohérente"],
    avoid: ["mélodrame artificiel", "confusion", "fiction présentée comme un fait"],
    keywords: ["histoire", "récit", "instagram", "tiktok", "reel", "livre", "terra", "blacklace"],
  },
  {
    id: "social",
    label: "Expert social media",
    description: "Adapte le rythme, le format et le CTA aux usages de la plateforme.",
    criteria: ["hook immédiat", "lecture mobile", "interaction naturelle"],
    avoid: ["hashtags décoratifs", "copier-coller cross-platform", "engagement artificiel"],
    keywords: ["instagram", "facebook", "linkedin", "tiktok", "social", "reel", "post"],
  },
  {
    id: "kdp",
    label: "Expert Amazon KDP",
    description: "Optimise la présentation d'un livre pour la découverte, la confiance et l'achat.",
    criteria: ["genre et lecteur clairs", "bénéfice de lecture", "mots-clés crédibles"],
    avoid: ["comparaisons mensongères", "métadonnées opaques", "résumé abstrait"],
    keywords: ["amazon", "kdp", "ebook", "livre", "roman", "auteur"],
  },
  {
    id: "b2b",
    label: "Expert marketing B2B",
    description: "Cadre une proposition professionnelle avec problème, valeur, preuve et prochain pas simple.",
    criteria: ["problème métier", "valeur mesurable", "prochain pas faible friction"],
    avoid: ["prospection de masse", "flatterie creuse", "message centré vendeur"],
    keywords: ["linkedin", "b2b", "prospect", "partenaire", "client", "rendez-vous"],
  },
];

const RECIPES: ReadonlyArray<{ id: string; match: (text: string) => boolean; profiles: readonly string[] }> = [
  { id: "kdp-launch", match: (text) => /amazon|kdp|ebook|livre|roman/.test(text), profiles: ["kdp", "branding", "marketing", "seo", "storytelling"] },
  { id: "social-story", match: (text) => /instagram|tiktok|reel|facebook/.test(text), profiles: ["social", "storytelling", "branding", "marketing"] },
  { id: "b2b-outreach", match: (text) => /linkedin|b2b|prospect|partenaire|client/.test(text), profiles: ["b2b", "marketing", "branding"] },
  { id: "web-discovery", match: (text) => /site|landing|seo|google|article/.test(text), profiles: ["seo", "marketing", "branding"] },
];

function normalized(input: ExpertiseSelectionInput): string {
  return `${input.universe} ${input.platform} ${input.prompt ?? ""}`.toLowerCase();
}

export function composeExpertise(input: ExpertiseSelectionInput, maximumProfiles = 5): ExpertiseSelection {
  const text = normalized(input);
  const recipe = RECIPES.find((item) => item.match(text));
  const requested = recipe?.profiles ?? PROFILES
    .filter((profile) => profile.keywords.some((keyword) => text.includes(keyword)))
    .map((profile) => profile.id);

  const ids = [...new Set(requested.length ? requested : ["branding", "marketing", "storytelling"])]
    .slice(0, Math.max(1, Math.min(6, maximumProfiles)));
  const profiles = ids
    .map((id) => PROFILES.find((profile) => profile.id === id))
    .filter((profile): profile is ExpertiseProfile => Boolean(profile));

  const promptBlock = profiles.map((profile) => [
    `### ${profile.label}`,
    profile.description,
    `Critères : ${profile.criteria.join(" ; ")}.`,
    `À éviter : ${profile.avoid.join(" ; ")}.`,
  ].join("\n")).join("\n\n");

  return {
    profiles,
    recipeId: recipe?.id ?? "adaptive",
    rationale: profiles.map((profile) => `${profile.label} mobilisé pour ${input.platform} / ${input.universe}`),
    promptBlock,
  };
}

export function listExpertiseProfiles(): readonly ExpertiseProfile[] {
  return PROFILES;
}
