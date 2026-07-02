import fs from "node:fs";
import path from "node:path";

export interface PublisherLoopSnapshot {
  readonly missions: unknown[];
  readonly harvestDrafts: unknown[];
  readonly publicationDrafts: unknown[];
  readonly activity: unknown[];
  readonly updatedAt: string;
  readonly source: "server";
}

const STORE_FILE = path.resolve(process.cwd(), ".publisher-server", "publisher-loop.json");

const EMPTY_SNAPSHOT: PublisherLoopSnapshot = {
  missions: [],
  harvestDrafts: [],
  publicationDrafts: [],
  activity: [],
  updatedAt: new Date(0).toISOString(),
  source: "server"
};

export function loadPublisherLoopSnapshot(): PublisherLoopSnapshot {
  if (!fs.existsSync(STORE_FILE)) {
    return EMPTY_SNAPSHOT;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_FILE, "utf8")) as Partial<PublisherLoopSnapshot>;
    return normalizeSnapshot(parsed);
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

export function savePublisherLoopSnapshot(input: Partial<PublisherLoopSnapshot>): PublisherLoopSnapshot {
  const snapshot = normalizeSnapshot({
    ...input,
    updatedAt: new Date().toISOString(),
    source: "server"
  });
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(snapshot, null, 2));
  return snapshot;
}

function normalizeSnapshot(input: Partial<PublisherLoopSnapshot>): PublisherLoopSnapshot {
  return {
    missions: Array.isArray(input.missions) ? input.missions : [],
    harvestDrafts: Array.isArray(input.harvestDrafts) ? input.harvestDrafts : [],
    publicationDrafts: Array.isArray(input.publicationDrafts) ? input.publicationDrafts : [],
    activity: Array.isArray(input.activity) ? input.activity : [],
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : new Date(0).toISOString(),
    source: "server"
  };
}
