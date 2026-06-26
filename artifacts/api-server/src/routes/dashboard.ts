import { Router } from "express";
import { eq, and, sql, desc } from "drizzle-orm";
import { db, postsTable, campaignsTable, agentsTable } from "@workspace/db";

const router = Router();

router.get("/stats", async (_req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [postsThisMonth] = await db
    .select({ count: sql<number>`count(*)` })
    .from(postsTable)
    .where(sql`${postsTable.createdAt} >= ${startOfMonth.toISOString()}`);

  const statusCounts = await db
    .select({ status: postsTable.status, count: sql<number>`count(*)` })
    .from(postsTable)
    .groupBy(postsTable.status);

  const [activeCampaigns] = await db
    .select({ count: sql<number>`count(*)` })
    .from(campaignsTable)
    .where(eq(campaignsTable.status, "active"));

  const [activeAgents] = await db
    .select({ count: sql<number>`count(*)` })
    .from(agentsTable)
    .where(eq(agentsTable.isActive, true));

  const countByStatus = (status: string) =>
    statusCounts.find((s) => s.status === status)?.count ?? 0;

  const connectorStatuses: Record<string, boolean> = {
    notion: !!(process.env.NOTION_API_KEY && process.env.NOTION_DATABASE_ID),
    mistral: !!process.env.MISTRAL_API_KEY,
    github: !!(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO),
    meta: !!(process.env.META_ACCESS_TOKEN && process.env.META_PAGE_ID),
    tiktok: !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_ACCESS_TOKEN),
    kdp: !!(process.env.KDP_ACCESS_KEY && process.env.KDP_SELLER_ID),
  };

  return res.json({
    totalPostsThisMonth: Number(postsThisMonth?.count ?? 0),
    draftCount: Number(countByStatus("draft")),
    scheduledCount: Number(countByStatus("scheduled")),
    approvedCount: Number(countByStatus("approved")),
    publishedCount: Number(countByStatus("published")),
    failedCount: Number(countByStatus("failed")),
    activeCampaigns: Number(activeCampaigns?.count ?? 0),
    activeAgents: Number(activeAgents?.count ?? 0),
    connectorStatuses,
  });
});

router.get("/recent-posts", async (_req, res) => {
  const posts = await db
    .select()
    .from(postsTable)
    .orderBy(desc(postsTable.createdAt))
    .limit(10);

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
