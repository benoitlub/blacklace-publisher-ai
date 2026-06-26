import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, campaignsTable, insertCampaignSchema } from "@workspace/db";

const router = Router();

router.get("/", async (_req, res) => {
  const campaigns = await db.select().from(campaignsTable).orderBy(campaignsTable.createdAt);
  return res.json(campaigns);
});

router.post("/", async (req, res) => {
  const parsed = insertCampaignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid campaign data" });
  const [campaign] = await db.insert(campaignsTable).values(parsed.data).returning();
  return res.status(201).json(campaign);
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id));
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  return res.json(campaign);
});

router.patch("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const partial = insertCampaignSchema.partial().safeParse(req.body);
  if (!partial.success) return res.status(400).json({ error: "Invalid data" });
  const [campaign] = await db.update(campaignsTable).set(partial.data).where(eq(campaignsTable.id, id)).returning();
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  return res.json(campaign);
});

router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  await db.delete(campaignsTable).where(eq(campaignsTable.id, id));
  return res.status(204).send();
});

export default router;
