import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  postsPerWeek: integer("posts_per_week").notNull().default(5),
  autonomyLevel: text("autonomy_level").notNull().default("manual"),
  mainLanguage: text("main_language").notNull().default("français"),
  globalTone: text("global_tone").notNull().default("Blacklace, humoristique, poétique, absurde contrôlé"),
  notionEnabled: boolean("notion_enabled").notNull().default(false),
  mistralEnabled: boolean("mistral_enabled").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
