import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, settingsTable, insertSettingsSchema } from "@workspace/db";

const router = Router();

async function getOrCreateSettings() {
  const rows = await db.select().from(settingsTable).limit(1);
  if (rows.length > 0) return rows[0];
  const [settings] = await db.insert(settingsTable).values({}).returning();
  return settings;
}

router.get("/", async (_req, res) => {
  const settings = await getOrCreateSettings();
  return res.json(settings);
});

router.patch("/", async (req, res) => {
  const settings = await getOrCreateSettings();
  const partial = insertSettingsSchema.partial().safeParse(req.body);
  if (!partial.success) return res.status(400).json({ error: "Invalid settings data" });
  const [updated] = await db
    .update(settingsTable)
    .set({ ...partial.data, updatedAt: new Date() })
    .where(eq(settingsTable.id, settings.id))
    .returning();
  return res.json(updated);
});

export default router;
