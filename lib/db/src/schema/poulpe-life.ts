import { pgTable, text, timestamp, jsonb, real, index } from "drizzle-orm/pg-core";

export const poulpeParcelsTable = pgTable("poulpe_parcels", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  payload: jsonb("payload").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const poulpeSeedsTable = pgTable("poulpe_seeds", {
  id: text("id").primaryKey(),
  parcelId: text("parcel_id").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().default("planted"),
  maturity: real("maturity").notNull().default(0),
  payload: jsonb("payload").notNull(),
  lastTickAt: timestamp("last_tick_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("poulpe_seeds_parcel_idx").on(table.parcelId),
  index("poulpe_seeds_status_idx").on(table.status),
]);

export const poulpeEventsTable = pgTable("poulpe_events", {
  id: text("id").primaryKey(),
  parcelId: text("parcel_id"),
  seedId: text("seed_id"),
  kind: text("kind").notNull(),
  label: text("label").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("poulpe_events_created_at_idx").on(table.createdAt),
  index("poulpe_events_seed_idx").on(table.seedId),
]);
