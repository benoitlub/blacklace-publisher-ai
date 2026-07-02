import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, postsTable, agentsTable, campaignsTable } from "@workspace/db";
import { generatePostDraft } from "../services/mistral";
import { fetchBlacklaceKnowledgeWithDiagnostics, buildKnowledgeContext } from "../services/notion";
import { logger } from "../lib/logger";
import { loadPublisherPersonas } from "../services/notion-knowledge-provider";

const router = Router();

const UNIVERSES = ["Blacklace", "Creature-Sync", "Kif & Molla", "TERRA", "Pro.Hibited", "Clochette", "Blacklace Dice"];
const PLATFORMS = ["Instagram", "Facebook", "TikTok", "Site web", "KDP"];

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

router.post("/month", async (_req, res) => {
  const body = _req.body as {
    harvestDrafts?: Array<{ id: string; missionId: string; seedId: string; parcel: string; title: string; summary: string }>;
  };
  const agents = await db.select().from(agentsTable).where(eq(agentsTable.isActive, true));
  const campaigns = await db.select().from(campaignsTable);
  const personas = agents.length > 0
    ? agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        role: agent.role,
        tone: agent.tone,
      }))
    : (await loadPublisherPersonas()).map((persona, index) => ({
        id: index + 1,
        name: persona.name,
        role: persona.role,
        tone: persona.tone,
      }));

  if (personas.length === 0) {
    return res.status(400).json({ error: "No personas available." });
  }

  const knowledge = await fetchBlacklaceKnowledgeWithDiagnostics();

  const posts = [];
  const publicationDrafts = [];
  const today = new Date();
  const harvestDrafts = body.harvestDrafts?.length
    ? body.harvestDrafts
    : [
        {
          id: "server-fallback-harvest",
          missionId: "server-fallback-mission",
          seedId: "server-fallback-seed",
          parcel: "Publisher",
          title: "Publication editoriale mensuelle",
          summary: "Planification mensuelle generee sans HarvestDraft local fourni."
        }
      ];

  for (let index = 0; index < Math.max(harvestDrafts.length, 6); index++) {
    const harvestDraft = harvestDrafts[index % harvestDrafts.length];
    const scheduledDate = addDays(today, index * 4 + 1);
    const persona = personas[index % personas.length];
    const universe = harvestDraft.parcel || UNIVERSES[index % UNIVERSES.length];
    const platform = PLATFORMS[index % PLATFORMS.length];
    const campaign = campaigns.length > 0 ? campaigns[index % campaigns.length] : null;

    const draft = await generatePostDraft({
      universe,
      agentName: persona.name,
      agentTone: persona.tone,
      platform,
      prompt: harvestDraft.summary,
      knowledgeContext: buildKnowledgeContext(knowledge.items, universe),
      knowledgeSource: knowledge.source,
    });

    posts.push({
      title: draft.title,
      content: draft.content,
      platform,
      status: "scheduled" as const,
      hashtags: draft.hashtags,
      scheduledAt: scheduledDate.toISOString(),
      agentId: agents.length > 0 ? persona.id : null,
      campaignId: campaign?.id ?? null,
      universe,
    });

    publicationDrafts.push({
      harvestDraftId: harvestDraft.id,
      missionId: harvestDraft.missionId,
      seedId: harvestDraft.seedId,
      parcel: harvestDraft.parcel,
      title: draft.title,
      channel: platform,
      text: draft.content,
      source: draft.isMock ? "mock" : "real",
      scheduledAt: scheduledDate.toISOString(),
      diagnostic: {
        provider: draft.provider,
        knowledgeSource: draft.knowledgeSource,
        model: draft.model,
        fallbackReason: draft.fallbackReason,
      },
    });
  }

  const inserted = await db.insert(postsTable).values(posts).returning();
  logger.info({ count: inserted.length, knowledgeSource: knowledge.source }, "Generated month of posts");
  return res.status(201).json({ count: inserted.length, posts: inserted, publicationDrafts });
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

  const knowledge = await fetchBlacklaceKnowledgeWithDiagnostics();

  const draft = await generatePostDraft({
    universe,
    agentName: agent.name,
    agentTone: agent.tone,
    platform: platform ?? "Instagram",
    prompt,
    knowledgeContext: buildKnowledgeContext(knowledge.items, universe),
    knowledgeSource: knowledge.source,
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

  return res.status(201).json({
    ...post,
    agentName: agent.name,
    campaignName: null,
    aiProvider: draft.provider,
    knowledgeSource: draft.knowledgeSource,
    isMock: draft.isMock,
    fallbackReason: draft.fallbackReason,
  });
});

export default router;
