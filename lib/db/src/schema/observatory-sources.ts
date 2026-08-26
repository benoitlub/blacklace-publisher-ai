import { pgTable, text, integer, timestamp, jsonb, real, index } from "drizzle-orm/pg-core";

/**
 * Sources ajoutées depuis l'Observatoire du dashboard.
 *
 * La table est créée et écrite par le Worker Cloudflare
 * (publisher-worker/src/db.ts, `ensureObservatorySchema`) : c'est le seul
 * backend déployé, et le pilote HTTP Neon est la seule façon d'atteindre
 * Postgres depuis le runtime Workers. Ce schéma Drizzle en est le miroir en
 * lecture, pour tout contexte Node (scripts, jobs, api-server) qui doit
 * relire les mêmes lignes de façon typée. Toute évolution de colonne doit
 * être faite des deux côtés, le DDL du Worker faisant foi.
 */
export const observatorySourcesTable = pgTable("observatory_sources", {
  id: text("id").primaryKey(),
  sourceKey: text("source_key").notNull().unique(),
  kind: text("kind").notNull(),
  value: text("value").notNull(),
  name: text("name").notNull(),
  category: text("category"),
  summary: text("summary"),
  averageConfidence: real("average_confidence").notNull().default(0),
  tags: text("tags").array().notNull().default([]),
  decision: text("decision").notNull().default("watch"),
  observationCount: integer("observation_count").notNull().default(1),
  pack: jsonb("pack"),
  octopus: jsonb("octopus"),
  firstObservedAt: timestamp("first_observed_at", { withTimezone: true }).notNull().defaultNow(),
  lastObservedAt: timestamp("last_observed_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("observatory_sources_last_observed_idx").on(table.lastObservedAt),
  index("observatory_sources_processed_at_idx").on(table.processedAt),
]);

export type ObservatorySourceRow = typeof observatorySourcesTable.$inferSelect;
export type InsertObservatorySourceRow = typeof observatorySourcesTable.$inferInsert;
