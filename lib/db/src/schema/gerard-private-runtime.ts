import { pgTable, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

// Shared with Poulpe Fiction's private runtime snapshot writer.
// Keep this declaration aligned with scripts/gerard-private-runtime.mjs.
export const gerardPrivateRuntimeTable = pgTable("gerard_private_runtime", {
  snapshotKey: text("snapshot_key").primaryKey(),
  version: integer("version").notNull(),
  payload: jsonb("payload").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
