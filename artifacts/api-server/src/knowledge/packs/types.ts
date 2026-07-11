export interface KnowledgePackAgent {
  name: string;
  role: string;
  tone: string;
  missions: string[];
  limits: string[];
  examplePhrases: string[];
  color?: string;
  avatar?: string;
}

export interface KnowledgePackExample {
  title: string;
  content: string;
  hashtags: string;
  agentName?: string;
  universe?: string;
  platform?: string;
}

export type BusinessGrowthModule =
  | "prospects"
  | "clients"
  | "partenaires"
  | "fabricants"
  | "editeurs"
  | "medias"
  | "influenceurs"
  | "investisseurs"
  | "opportunites"
  | "campagnes"
  | "relances";

export interface BusinessGrowthIdentity {
  nom: string;
  entreprise?: string;
  role?: string;
  secteur?: string;
  pays?: string;
  langue?: string;
}

export interface BusinessGrowthCoordinates {
  email?: string;
  site?: string;
  reseauxSociaux?: string[];
}

export interface BusinessGrowthExchange {
  date: string;
  canal: "email" | "notion" | "publication" | "event" | "manual" | "other";
  summary: string;
  responseReceived?: boolean;
}

export interface BusinessGrowthHistory {
  datePremierContact?: string;
  origineContact?: string;
  echanges: BusinessGrowthExchange[];
  reponsesRecues: string[];
  documentsEnvoyes: string[];
  produitsPresentes: string[];
}

export interface BusinessGrowthCompatibility {
  projetsCompatibles: string[];
  rationale: string[];
}

export interface BusinessGrowthIntelligence {
  interetEstime: number;
  probabiliteReponse: number;
  probabiliteConversion: number;
  derniereActivite?: string;
  niveauConfiance: number;
  scoreCommercial: number;
}

export interface BusinessGrowthRecommendations {
  meilleureProchaineAction: string;
  meilleurMomentRelance: string;
  produitAProposer?: string;
  tonAEmployer: string;
  documentsAJoindre: string[];
  anciensEchangesARappeler: string[];
}

export interface BusinessGrowthSeed {
  id: string;
  module: BusinessGrowthModule;
  identity: BusinessGrowthIdentity;
  coordinates: BusinessGrowthCoordinates;
  history: BusinessGrowthHistory;
  compatibility: BusinessGrowthCompatibility;
  intelligence: BusinessGrowthIntelligence;
  recommendations: BusinessGrowthRecommendations;
  tags: string[];
  updatedAt: string;
}

export interface BusinessGrowthIntegrationRule {
  source: "radar" | "observatoire" | "memoire" | "seeds" | "intent" | "harvest" | "publications" | "gmail" | "notion";
  behavior: string;
}

export interface BusinessGrowthPackage {
  modules: BusinessGrowthModule[];
  compatibleProjects: string[];
  requiredFields: {
    identite: string[];
    coordonnees: string[];
    historique: string[];
  };
  integrationRules: BusinessGrowthIntegrationRule[];
}

export interface KnowledgePack {
  id: string;
  name: string;
  description: string;
  universes: string[];
  agents: KnowledgePackAgent[];
  toneRules: string[];
  forbiddenTopics: string[];
  platforms: string[];
  editorialGoals: string[];
  hashtags: string[];
  examples: KnowledgePackExample[];
  businessGrowth?: BusinessGrowthPackage;
}
