import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, postsTable, agentsTable, campaignsTable } from "@workspace/db";
import { generatePostDraft } from "../services/mistral";
import { logger } from "../lib/logger";

const router = Router();

const UNIVERSES = ["Blacklace", "Creature-Sync", "Kif & Molla", "TERRA", "Pro.Hibited", "Clochette", "Blacklace Dice"];
const PLATFORMS = ["Instagram", "Facebook", "TikTok", "Site web", "KDP"];

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

router.post("/month", async (_req, res) => {
  const agents = await db.select().from(agentsTable).where(eq(agentsTable.isActive, true));
  const campaigns = await db.select().from(campaignsTable);

  if (agents.length === 0) {
    return res.status(400).json({ error: "No active agents found. Please seed agents first." });
  }

  const posts = [];
  const today = new Date();

  for (let day = 0; day < 30; day++) {
    const scheduledDate = addDays(today, day + 1);

    const postsForDay = day % 7 === 6 ? 0 : Math.random() < 0.7 ? 1 : 2;
    for (let p = 0; p < postsForDay; p++) {
      const agent = agents[Math.floor(Math.random() * agents.length)];
      const universe = UNIVERSES[Math.floor(Math.random() * UNIVERSES.length)];
      const platform = PLATFORMS[Math.floor(Math.random() * PLATFORMS.length)];
      const campaign = campaigns.length > 0 ? campaigns[Math.floor(Math.random() * campaigns.length)] : null;

      const draft = await generatePostDraft({
        universe,
        agentName: agent.name,
        agentTone: agent.tone,
        platform,
      });

      posts.push({
        title: draft.title,
        content: draft.content,
        platform,
        status: "draft" as const,
        hashtags: draft.hashtags,
        scheduledAt: scheduledDate.toISOString(),
        agentId: agent.id,
        campaignId: campaign?.id ?? null,
        universe,
      });
    }
  }

  const inserted = await db.insert(postsTable).values(posts).returning();
  logger.info({ count: inserted.length }, "Generated month of posts");
  return res.status(201).json({ count: inserted.length, posts: inserted });
});

router.post("/post", async (req, res) => {
  const { universe, agentId, platform, campaignId, prompt } = req.body as {
    universe: string;
    agentId: number;
    platform?: string;
    campaignId?: number;
    prompt?: string;
  };

  if (!universe || !agentId) {
    return res.status(400).json({ error: "universe and agentId are required" });
  }

  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId));
  if (!agent) return res.status(404).json({ error: "Agent not found" });

  const draft = await generatePostDraft({
    universe,
    agentName: agent.name,
    agentTone: agent.tone,
    platform: platform ?? "Instagram",
    prompt,
  });

  const [post] = await db
    .insert(postsTable)
    .values({
      title: draft.title,
      content: draft.content,
      platform: platform ?? "Instagram",
      status: "draft",
      hashtags: draft.hashtags,
      agentId: agent.id,
      campaignId: campaignId ?? null,
      universe,
    })
    .returning();

  return res.status(201).json({ ...post, agentName: agent.name, campaignName: null });
});

export default router;
