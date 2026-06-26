import { Router } from "express";
import { eq, gte, sql } from "drizzle-orm";
import { db, postsTable, agentsTable, campaignsTable } from "@workspace/db";

const router = Router();

router.get("/", async (_req, res) => {
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const posts = await db
    .select()
    .from(postsTable)
    .where(
      sql`${postsTable.scheduledAt} >= ${now.toISOString()} AND ${postsTable.scheduledAt} <= ${in30Days.toISOString()}`
    )
    .orderBy(postsTable.scheduledAt);

  const enriched = await Promise.all(
    posts.map(async (post) => {
      const [agent] = post.agentId
        ? await db.select({ name: agentsTable.name }).from(agentsTable).where(eq(agentsTable.id, post.agentId))
        : [null];
      const [campaign] = post.campaignId
        ? await db.select({ name: campaignsTable.name }).from(campaignsTable).where(eq(campaignsTable.id, post.campaignId))
        : [null];
      return { ...post, agentName: agent?.name ?? null, campaignName: campaign?.name ?? null };
    })
  );

  return res.json(enriched);
});

export default router;
