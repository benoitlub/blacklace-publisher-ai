import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => new Map<string, Map<string, { value: unknown; version: number; updatedAt: string }>>());

vi.mock("@workspace/db", () => ({ pool: null }));
vi.mock("../lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock("../services/global-state", () => ({
  readGlobalState: async <T>(namespace: string, key: string) => {
    const record = state.get(namespace)?.get(key);
    return record ? { namespace, key, value: record.value as T, version: record.version, updatedAt: record.updatedAt } : null;
  },
  writeGlobalState: async <T>(namespace: string, key: string, value: T) => {
    const bucket = state.get(namespace) ?? new Map();
    const previous = bucket.get(key);
    const record = { value, version: (previous?.version ?? 0) + 1, updatedAt: new Date().toISOString() };
    bucket.set(key, record);
    state.set(namespace, bucket);
    return { namespace, key, value, version: record.version, updatedAt: record.updatedAt };
  },
  listGlobalState: async <T>(namespace: string) => {
    const bucket = state.get(namespace) ?? new Map();
    return [...bucket.entries()].map(([key, record]) => ({
      namespace,
      key,
      value: record.value as T,
      version: record.version,
      updatedAt: record.updatedAt,
    }));
  },
}));

import { tickKnowledgeGardener, type KnowledgeParcel } from "./gardener";
import type { KnowledgeSourceRecord } from "./harvesters";
import type { KnowledgePackage } from "./synthesizer";
import { writeGlobalState, readGlobalState, listGlobalState } from "../services/global-state";

describe("Knowledge Gardener autonomous integration", () => {
  beforeEach(() => state.clear());

  it("turns a registered parcel and connected source into a versioned Knowledge Package without manual intervention", async () => {
    const parcel: KnowledgeParcel = {
      id: "parcel-terra",
      name: "TERRA",
      status: "current",
      enabled: true,
      sourceIds: ["github:terra-readme"],
    };
    const source: KnowledgeSourceRecord = {
      id: "github:terra-readme",
      parcelId: parcel.id,
      kind: "github",
      title: "TERRA repository README",
      text: "TERRA est une fable cosmique publiée en français et en espagnol. Le projet dispose d'une page Amazon et doit être promu auprès de lecteurs de science-fiction poétique.",
      url: "https://github.com/benoitlub/terra",
      updatedAt: "2026-07-22T12:00:00.000Z",
    };

    await writeGlobalState("knowledge-parcels", parcel.id, parcel);
    await writeGlobalState("knowledge-sources", source.id, source);

    const firstStatus = await tickKnowledgeGardener();
    const firstPackage = await readGlobalState<KnowledgePackage>("knowledge-packages", parcel.id);
    const observations = await listGlobalState("knowledge-observations");
    const activities = await listGlobalState("publisher-activity");

    expect(firstStatus.errors).toEqual([]);
    expect(firstStatus.parcelsSeen).toBe(1);
    expect(firstStatus.sourcesHarvested).toBe(1);
    expect(firstStatus.packagesWritten).toBe(1);
    expect(observations).toHaveLength(1);
    expect(firstPackage?.value.parcelId).toBe(parcel.id);
    expect(firstPackage?.value.parcelName).toBe("TERRA");
    expect(firstPackage?.value.version).toBe(1);
    expect(firstPackage?.value.coverage).toBeGreaterThan(0);
    expect(firstPackage?.value.sources.map((item) => item.id)).toContain(source.id);
    expect(activities.some((item) => (item.value as { kind?: string }).kind === "knowledge-package-updated")).toBe(true);

    const secondStatus = await tickKnowledgeGardener();
    const secondPackage = await readGlobalState<KnowledgePackage>("knowledge-packages", parcel.id);
    const observationsAfterSecondTick = await listGlobalState("knowledge-observations");

    expect(secondStatus.errors).toEqual([]);
    expect(secondStatus.sourcesHarvested).toBe(0);
    expect(observationsAfterSecondTick).toHaveLength(1);
    expect(secondPackage?.value.version).toBe(2);
    expect(secondPackage?.value.previousVersion).toBe(1);
  });
});
