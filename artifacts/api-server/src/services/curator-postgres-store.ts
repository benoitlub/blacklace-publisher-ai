import { and, asc, eq, inArray, lt } from "drizzle-orm";
import { db } from "@workspace/db";
import * as dbSchema from "@workspace/db/schema";
import { curatorClusterKey, type CuratorOutcome, type CuratorSignal } from "./autonomous-curator.js";

const TTL_DAYS = 14;
const MAX_RECORDS = 100;
const curatorSignalsTable = (dbSchema as Record<string, any>).curatorSignalsTable;

function expiry(from = new Date()): Date {
  const date = new Date(from);
  date.setUTCDate(date.getUTCDate() + TTL_DAYS);
  return date;
}

function decodeSignal(payload: unknown): CuratorSignal {
  return payload as CuratorSignal;
}

export class CuratorPostgresStore {
  async ingest(signal: CuratorSignal): Promise<{ clusterKey: string; duplicateCount: number; expiresAt: string }> {
    const clusterKey = curatorClusterKey(signal);
    const [existing] = await db.select().from(curatorSignalsTable)
      .where(and(eq(curatorSignalsTable.clusterKey, clusterKey), eq(curatorSignalsTable.decision, "captured")))
      .limit(1);

    if (existing) {
      const previous = decodeSignal(existing.payload);
      const merged: CuratorSignal = {
        ...previous,
        ...signal,
        claims: [...new Set([...(previous.claims ?? []), ...(signal.claims ?? [])])],
        tags: [...new Set([...(previous.tags ?? []), ...(signal.tags ?? [])])],
        evidenceRefs: [...new Set([...(previous.evidenceRefs ?? []), ...(signal.evidenceRefs ?? [])])],
      };
      const [updated] = await db.update(curatorSignalsTable).set({
        payload: merged,
        source: signal.source,
        title: signal.title,
        kind: signal.kind ?? "unknown",
        summary: signal.summary,
        duplicateCount: existing.duplicateCount + 1,
        expiresAt: expiry(),
        updatedAt: new Date(),
      }).where(eq(curatorSignalsTable.id, existing.id)).returning();
      if (!updated) throw new Error("Curator signal update returned no row.");
      return { clusterKey, duplicateCount: updated.duplicateCount, expiresAt: updated.expiresAt.toISOString() };
    }

    await this.prune();
    const createdRows = await db.insert(curatorSignalsTable).values({
      id: signal.id,
      clusterKey,
      title: signal.title,
      source: signal.source,
      kind: signal.kind ?? "unknown",
      summary: signal.summary,
      payload: signal,
      expiresAt: expiry(),
    }).onConflictDoNothing().returning() as Array<any>;
    const [created] = createdRows;

    if (!created) {
      const [row] = await db.select().from(curatorSignalsTable).where(eq(curatorSignalsTable.id, signal.id)).limit(1);
      if (!row) throw new Error("Curator signal conflict could not be resolved.");
      return { clusterKey: row.clusterKey, duplicateCount: row.duplicateCount, expiresAt: row.expiresAt.toISOString() };
    }

    await this.enforceBound();
    return { clusterKey, duplicateCount: 0, expiresAt: created.expiresAt.toISOString() };
  }

  async list(limit = 100): Promise<CuratorSignal[]> {
    await this.prune();
    const rows = await db.select().from(curatorSignalsTable)
      .where(eq(curatorSignalsTable.decision, "captured"))
      .orderBy(asc(curatorSignalsTable.receivedAt))
      .limit(limit);
    return rows.map((row) => decodeSignal(row.payload));
  }

  async status(): Promise<Array<{ signalId: string; title: string; clusterKey: string; duplicateCount: number; expiresAt: string }>> {
    await this.prune();
    const rows = await db.select().from(curatorSignalsTable)
      .where(eq(curatorSignalsTable.decision, "captured"))
      .orderBy(asc(curatorSignalsTable.receivedAt));
    return rows.map((row) => ({ signalId: row.id, title: row.title, clusterKey: row.clusterKey, duplicateCount: row.duplicateCount, expiresAt: row.expiresAt.toISOString() }));
  }

  async apply(outcomes: readonly CuratorOutcome[]): Promise<void> {
    for (const outcome of outcomes) {
      await db.update(curatorSignalsTable).set({
        decision: outcome.decision,
        evidenceQuality: outcome.score.evidenceQuality,
        missionRelevance: outcome.score.missionRelevance,
        processedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(curatorSignalsTable.clusterKey, outcome.clusterKey));
    }
  }

  async prune(): Promise<void> {
    await db.delete(curatorSignalsTable).where(and(
      eq(curatorSignalsTable.decision, "captured"),
      lt(curatorSignalsTable.expiresAt, new Date()),
    ));
  }

  private async enforceBound(): Promise<void> {
    const rows = await db.select({ id: curatorSignalsTable.id }).from(curatorSignalsTable)
      .where(eq(curatorSignalsTable.decision, "captured"))
      .orderBy(asc(curatorSignalsTable.receivedAt));
    const excess = rows.length - MAX_RECORDS;
    if (excess > 0) {
      await db.delete(curatorSignalsTable).where(inArray(curatorSignalsTable.id, rows.slice(0, excess).map((row) => row.id)));
    }
  }
}
