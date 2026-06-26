import { Router } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, postsTable, agentsTable, campaignsTable, insertPostSchema } from "@workspace/db";
import { logger } from "../lib/logger";

const router = Router();

async function enrichPost(post: typeof postsTable.$inferSelect) {
  const [agent] = post.agentId
    ? await db.select({ name: agentsTable.name }).from(agentsTable).where(eq(agentsTable.id, post.agentId))
    : [null];
  const [campaign] = post.campaignId
    ? await db.select({ name: campaignsTable.name }).from(campaignsTable).where(eq(campaignsTable.id, post.campaignId))
    : [null];
  return {
    ...post,
    agentName: agent?.name ?? null,
    campaignName: campaign?.name ?? null,
    scheduledAt: post.scheduledAt ?? null,
  };
}

router.get("/", async (req, res) => {
  const { status, agentId, campaignId, platform } = req.query as Record<string, string | undefined>;
  const conditions = [];
  if (status) conditions.push(eq(postsTable.status, status));
  if (agentId) conditions.push(eq(postsTable.agentId, parseInt(agentId)));
  if (campaignId) conditions.push(eq(postsTable.campaignId, parseInt(campaignId)));
  if (platform) conditions.push(eq(postsTable.platform, platform));

  const rows = conditions.length
    ? await db.select().from(postsTable).where(and(...conditions)).orderBy(postsTable.createdAt)
    : await db.select().from(postsTable).orderBy(postsTable.createdAt);

  const enriched = await Promise.all(rows.map(enrichPost));
  return res.json(enriched);
});

router.post("/", async (req, res) => {
  const parsed = insertPostSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid post data" });
  const [post] = await db.insert(postsTable).values(parsed.data).returning();
  return res.status(201).json(await enrichPost(post));
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, id));
  if (!post) return res.status(404).json({ error: "Post not found" });
  return res.json(await enrichPost(post));
});

router.patch("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const partial = insertPostSchema.partial().safeParse(req.body);
  if (!partial.success) return res.status(400).json({ error: "Invalid data" });
  const [post] = await db.update(postsTable).set(partial.data).where(eq(postsTable.id, id)).returning();
  if (!post) return res.status(404).json({ error: "Post not found" });
  return res.json(await enrichPost(post));
});

router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  await db.delete(postsTable).where(eq(postsTable.id, id));
  return res.status(204).send();
});

router.patch("/:id/approve", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const [post] = await db.update(postsTable).set({ status: "approved" }).where(eq(postsTable.id, id)).returning();
  if (!post) return res.status(404).json({ error: "Post not found" });
  return res.json(await enrichPost(post));
});

export default router;
