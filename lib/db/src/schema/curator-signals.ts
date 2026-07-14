import { pgTable, text, integer, timestamp, jsonb, real, index } from "drizzle-orm/pg-core";

export const curatorSignalsTable = pgTable("curator_signals", {
  id: text("id").primaryKey(),
  clusterKey: text("cluster_key").notNull(),
  title: text("title").notNull(),
  source: text("source").notNull(),
  kind: text("kind").notNull().default("unknown"),
  summary: text("summary"),
  payload: jsonb("payload").notNull(),
  duplicateCount: integer("duplicate_count").notNull().default(0),
  evidenceQuality: real("evidence_quality"),
  missionRelevance: real("mission_relevance"),
  decision: text("decision").notNull().default("captured"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("curator_signals_cluster_key_idx").on(table.clusterKey),
  index("curator_signals_decision_idx").on(table.decision),
  index("curator_signals_expires_at_idx").on(table.expiresAt),
]);

export type CuratorSignalRow = typeof curatorSignalsTable.$inferSelect;
export type InsertCuratorSignalRow = typeof curatorSignalsTable.$inferInsert;
