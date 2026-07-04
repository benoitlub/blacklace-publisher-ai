import { Router } from "express";
import { fetchBlacklaceKnowledgeWithDiagnostics } from "../services/notion";
import { logger } from "../lib/logger";

const router = Router();

type AgentResponse = {
  id: number;
  name: string;
  role: string;
  tone: string;
  missions: string | null;
  limits: string | null;
  examplePhrases: string | null;
  color: string | null;
  avatar: string | null;
  isActive: boolean;
  createdAt: string;
  source?: "db" | "notion" | "mock";
};

const FALLBACK_AGENTS: AgentResponse[] = [
  {
    id: 1,
    name: "Natasha",
    role: "Directrice de publication",
    tone: "Journalistique, officiel, clair et précis",
    missions: "Transformer les récoltes en annonces éditoriales structurées.",
    limits: "Pas d'humour graveleux, pas de sarcasme, toujours rester factuel et lisible.",
    examplePhrases: "Le Feuch Institute est fier d'annoncer...\nCe mois-ci, nos agents ont produit...",
    color: "#C0392B",
    avatar: null,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    source: "mock",
  },
  {
    id: 2,
    name: "Marty",
    role: "Chroniqueur technique et coulisses",
    tone: "Direct, légèrement autodérisoire, humour pratique",
    missions: "Expliquer les avancées techniques sans jargon inutile.",
    limits: "Pas de jargon inintelligible sans explication, garder un humour utile.",
    examplePhrases: "Journée de refacto intense.\nLes tests passent à 94%. Les 6% restants impliquent une marmotte.",
    color: "#2980B9",
    avatar: null,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    source: "mock",
  },
  {
    id: 3,
    name: "Feuch",
    role: "Observateur cyclope des bipèdes",
    tone: "Sceptique, cosmique, faussement blasé",
    missions: "Questionner les évidences et repérer l'angle absurde ou mythologique.",
    limits: "Ne pas écraser le message principal sous l'absurde.",
    examplePhrases: "Les bipèdes appellent cela une stratégie. Feuch appelle cela une pluie de post-it.",
    color: "#8E44AD",
    avatar: null,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    source: "mock",
  },
  {
    id: 4,
    name: "Birdy",
    role: "Naturaliste et poète de terrain",
    tone: "Sensible, précis, attentif au vivant",
    missions: "Relier les projets aux observations du terrain et aux signes discrets.",
    limits: "Ne pas surinterpréter les signaux faibles.",
    examplePhrases: "Le jardin a parlé doucement ce matin. J'ai noté trois pistes et un merle sceptique.",
    color: "#27AE60",
    avatar: null,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    source: "mock",
  },
  {
    id: 5,
    name: "Clochette",
    role: "Assistante de proximité",
    tone: "Encourageante, vive, protectrice sans infantiliser",
    missions: "Réduire la charge mentale et proposer la prochaine petite action faisable.",
    limits: "Ne pas culpabiliser, ne pas surcharger.",
    examplePhrases: "On fait petit, mais on fait vrai. Une graine suffit pour commencer.",
    color: "#F39C12",
    avatar: null,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    source: "mock",
  },
  {
    id: 6,
    name: "Sofia",
    role: "Architecte éditoriale",
    tone: "Calme, structurée, stratégique",
    missions: "Organiser les campagnes, prioriser les publications et clarifier les livrables.",
    limits: "Ne pas complexifier inutilement.",
    examplePhrases: "On garde l'intention, on simplifie le chemin, puis on publie.",
    color: "#7F8C8D",
    avatar: null,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    source: "mock",
  },
];

async function loadDbModule() {
  return import("@workspace/db");
}

async function loadDbAgents(): Promise<AgentResponse[]> {
  const { db, agentsTable } = await loadDbModule();
  const agents = await db.select().from(agentsTable).orderBy(agentsTable.id);
  return agents.map((agent) => ({ ...agent, createdAt: agent.createdAt.toISOString(), source: "db" as const }));
}

async function loadNotionAgents(): Promise<AgentResponse[]> {
  const diagnostics = await fetchBlacklaceKnowledgeWithDiagnostics();
  if (diagnostics.source !== "notion") {
    return [];
  }

  const content = diagnostics.items.map((item) => `${item.title}\n${item.content}`).join("\n\n").toLowerCase();
  const detected = FALLBACK_AGENTS.filter((agent) => content.includes(agent.name.toLowerCase())).map((agent) => ({
    ...agent,
    source: "notion" as const,
  }));

  logger.info(
    {
      source: diagnostics.source,
      title: diagnostics.title,
      detectedPersonas: detected.length,
    },
    "Personas detected from Notion knowledge",
  );

  return detected;
}

async function getAvailableAgents(): Promise<AgentResponse[]> {
  try {
    const dbAgents = await loadDbAgents();
    if (dbAgents.length > 0) {
      return dbAgents;
    }
  } catch (err) {
    logger.warn({ err }, "Unable to load agents from database, trying Notion/fallback");
  }

  try {
    const notionAgents = await loadNotionAgents();
    if (notionAgents.length > 0) {
      return notionAgents;
    }
  } catch (err) {
    logger.warn({ err }, "Unable to load personas from Notion, using fallback agents");
  }

  return FALLBACK_AGENTS;
}

router.get("/", async (req, res) => {
  const agents = await getAvailableAgents();
  return res.json(agents);
});

router.post("/", async (req, res) => {
  try {
    const { db, agentsTable, insertAgentSchema } = await loadDbModule();
    const parsed = insertAgentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid agent data", details: parsed.error.format() });
    }
    const [agent] = await db.insert(agentsTable).values(parsed.data).returning();
    return res.status(201).json({ ...agent, createdAt: agent.createdAt.toISOString(), source: "db" });
  } catch (err) {
    logger.error({ err }, "Unable to create agent");
    return res.status(503).json({ error: "Agent database unavailable" });
  }
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const agents = await getAvailableAgents();
  const agent = agents.find((candidate) => candidate.id === id);
  if (!agent) return res.status(404).json({ error: "Agent not found" });
  return res.json(agent);
});

router.patch("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  try {
    const { db, agentsTable, insertAgentSchema } = await loadDbModule();
    const { eq } = await import("drizzle-orm");
    const partial = insertAgentSchema.partial().safeParse(req.body);
    if (!partial.success) return res.status(400).json({ error: "Invalid data" });
    const [agent] = await db.update(agentsTable).set(partial.data).where(eq(agentsTable.id, id)).returning();
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    return res.json({ ...agent, createdAt: agent.createdAt.toISOString(), source: "db" });
  } catch (err) {
    logger.warn({ err }, "Unable to update agent in database, returning fallback projection");
    const fallbackAgent = FALLBACK_AGENTS.find((agent) => agent.id === id);
    if (!fallbackAgent) return res.status(404).json({ error: "Agent not found" });
    return res.json({ ...fallbackAgent, ...req.body });
  }
});

router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  try {
    const { db, agentsTable } = await loadDbModule();
    const { eq } = await import("drizzle-orm");
    await db.delete(agentsTable).where(eq(agentsTable.id, id));
    return res.status(204).send();
  } catch (err) {
    logger.warn({ err }, "Unable to delete agent from database");
    return res.status(204).send();
  }
});

export default router;
