import { describe, expect, it } from "vitest";
import { CuratorSourceInbox } from "../curator-source-inbox.js";
import type { CuratorSignal } from "../autonomous-curator.js";

function signal(id: string, title: string, source: string): CuratorSignal {
  return {
    id,
    title,
    source,
    capturedAt: "2026-07-14T10:00:00.000Z",
    kind: "tool",
    tags: ["ebook advertising"],
    evidenceRefs: [`evidence:${id}`],
  };
}

describe("CuratorSourceInbox", () => {
  it("merges duplicates instead of growing forever", () => {
    const inbox = new CuratorSourceInbox({ ttlDays: 14, maximumRecords: 10 });
    inbox.ingest(signal("one", "Ebook Ads Service", "instagram"));
    const merged = inbox.ingest(signal("two", "Ebook Ads Service", "web"));

    expect(inbox.list()).toHaveLength(1);
    expect(merged.duplicateCount).toBe(1);
    expect(merged.sources).toEqual(["instagram", "web"]);
    expect(merged.signal.evidenceRefs).toHaveLength(2);
  });

  it("expires stale raw captures", () => {
    const inbox = new CuratorSourceInbox({ ttlDays: 1, maximumRecords: 10 });
    inbox.ingest(signal("one", "Old signal", "manual"), "2026-07-10T10:00:00.000Z");

    expect(inbox.list(new Date("2026-07-12T10:00:00.000Z"))).toHaveLength(0);
  });

  it("keeps a strict maximum size", () => {
    const inbox = new CuratorSourceInbox({ ttlDays: 14, maximumRecords: 2 });
    inbox.ingest(signal("one", "First source", "manual"), "2026-07-14T10:00:00.000Z");
    inbox.ingest(signal("two", "Second source", "manual"), "2026-07-14T11:00:00.000Z");
    inbox.ingest(signal("three", "Third source", "manual"), "2026-07-14T12:00:00.000Z");

    // Reference date fixed inside the TTL window. Reading with the wall clock
    // made this test expire on its own: records captured on 2026-07-14 with a
    // 14-day TTL are pruned from 2026-07-28 onwards, so `list()` returned
    // nothing and the assertion stopped exercising the size bound at all.
    const withinTtl = new Date("2026-07-14T13:00:00.000Z");

    expect(inbox.list(withinTtl)).toHaveLength(2);
    expect(inbox.list(withinTtl).map((item) => item.signal.id)).not.toContain("one");
  });
});
