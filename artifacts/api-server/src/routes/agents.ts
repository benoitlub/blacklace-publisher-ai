import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, agentsTable, insertAgentSchema } from "@workspace/db";
import { logger } from "../lib/logger";

const router = Router();

router.get("/", async (req, res) => {
  const agents = await db.select().from(agentsTable).orderBy(agentsTable.id);
  return res.json(agents);
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
