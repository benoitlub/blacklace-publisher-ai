import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, agentsTable, insertAgentSchema } from "@workspace/db";
import { logger } from "../lib/logger";
import { loadPublisherPersonas } from "../services/notion-knowledge-provider";

const router = Router();

router.get("/", async (req, res) => {
  const agents = await db.select().from(agentsTable).orderBy(agentsTable.id);
  if (agents.length > 0) {
    return res.json(agents);
  }

  let personas = await loadPublisherPersonas();
  if (personas.length === 0) {
    logger.warn("No publisher personas returned; using hard fallback agents");
    personas = [
      {
        id: "persona-hard-natasha",
        name: "Natasha",
        role: "Direction editoriale",
        tone: "officiel, structure, clair",
        goals: ["Transformer les recoltes en publications lisibles"],
        capabilities: ["text.post"],
        knowledgeSources: ["Publisher"],
        source: "local"
      },
      {
        id: "persona-hard-marty",
        name: "Marty",
        role: "Operations contenu",
        tone: "direct, pratique, leger",
        goals: ["Preparer des contenus actionnables"],
        capabilities: ["text.post"],
        knowledgeSources: ["Publisher"],
        source: "local"
      },
      {
        id: "persona-hard-feuch",
        name: "Feuch",
        role: "Direction creative",
        tone: "tranchant, visionnaire, ironique",
        goals: ["Preserver la coherence Blacklace"],
        capabilities: ["text.post"],
        knowledgeSources: ["Bible Blacklace"],
        source: "local"
      },
      {
        id: "persona-hard-birdy",
        name: "Birdy",
        role: "Veille et reseaux",
        tone: "alerte, concis, social",
        goals: ["Adapter les contenus aux plateformes sociales"],
        capabilities: ["metadata.tags"],
        knowledgeSources: ["Publisher"],
        source: "local"
      },
      {
        id: "persona-hard-clochette",
        name: "Clochette",
        role: "Coordination client",
        tone: "clair, rassurant, operationnel",
        goals: ["Transformer les intentions client en actions lisibles"],
        capabilities: ["text.summary"],
        knowledgeSources: ["Constitution Octopus"],
        source: "local"
      },
      {
        id: "persona-hard-sofia",
        name: "Sofia",
        role: "Analyste documentaire",
        tone: "precis, synthetique, methodique",
        goals: ["Extraire les angles utiles"],
        capabilities: ["text.summary"],
        knowledgeSources: ["Constitution Octopus"],
        source: "local"
      }
    ];
  }
  return res.json(
    personas.map((persona, index) => ({
      id: index + 1,
      name: persona.name,
      role: persona.role,
      tone: persona.tone,
      missions: persona.goals.join("\n"),
      limits: null,
      examplePhrases: persona.capabilities.join("\n"),
      color: null,
      avatar: null,
      isActive: true,
      createdAt: new Date(0).toISOString(),
      goals: persona.goals,
      capabilities: persona.capabilities,
      knowledgeSources: persona.knowledgeSources,
      source: persona.source
    }))
  );
});

router.post("/", async (req, res) => {
  const parsed = insertAgentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid agent data", details: parsed.error.format() });
  }
  const [agent] = await db.insert(agentsTable).values(parsed.data).returning();
  return res.status(201).json(agent);
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, id));
  if (!agent) return res.status(404).json({ error: "Agent not found" });
  return res.json(agent);
});

router.patch("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const partial = insertAgentSchema.partial().safeParse(req.body);
  if (!partial.success) return res.status(400).json({ error: "Invalid data" });
  const [agent] = await db.update(agentsTable).set(partial.data).where(eq(agentsTable.id, id)).returning();
  if (!agent) return res.status(404).json({ error: "Agent not found" });
  return res.json(agent);
});

router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  await db.delete(agentsTable).where(eq(agentsTable.id, id));
  return res.status(204).send();
});

export default router;
