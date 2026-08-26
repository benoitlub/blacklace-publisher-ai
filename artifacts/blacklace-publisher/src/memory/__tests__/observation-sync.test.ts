import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ObservatorySourceRecord } from "@/models/observatory-source";
import { loadObservationMemory, saveObservationMemory } from "@/memory/observation-memory";
import { mergeServerRecords, syncObservationMemoryFromServer } from "@/memory/observation-sync";
import type { ObservationMemoryEntry } from "@/models/observation-memory";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function serverRecord(overrides: Partial<ObservatorySourceRecord> = {}): ObservatorySourceRecord {
  return {
    id: "obs_1",
    sourceKey: "lovable.dev",
    kind: "url",
    value: "https://www.lovable.dev/",
    name: "lovable.dev",
    category: "outil",
    summary: "Generateur d'applications web.",
    averageConfidence: 0.7,
    tags: ["ia"],
    decision: "watch",
    observationCount: 2,
    pack: null,
    octopus: null,
    firstObservedAt: "2026-01-01T00:00:00.000Z",
    lastObservedAt: "2026-01-02T00:00:00.000Z",
    processedAt: null,
    ...overrides,
  };
}

function localEntry(overrides: Partial<ObservationMemoryEntry> = {}): ObservationMemoryEntry {
  return {
    id: "memory-local",
    name: "lovable.dev",
    sourceKind: "url",
    sourceValue: "https://lovable.dev",
    category: "outil",
    firstObservedAt: "2025-12-01T00:00:00.000Z",
    lastObservedAt: "2025-12-01T00:00:00.000Z",
    observationCount: 1,
    averageConfidence: 0.4,
    tags: ["ia"],
    comparableNames: ["v0.dev"],
    currentDecision: "watch",
    lastSummary: "Ancienne observation locale.",
    lastPack: {
      id: "pack-local",
      title: "lovable.dev",
      summary: "Ancienne observation locale.",
      capabilities: ["generation"],
      patterns: [],
      recommendations: [],
      tags: ["ia"],
      confidence: 0.4,
      generatedAt: "2025-12-01T00:00:00.000Z",
      sourceReferences: [],
      themes: [],
    },
    history: [{ observedAt: "2025-12-01T00:00:00.000Z", confidence: 0.4, packId: "pack-local", summary: "Ancienne observation locale." }],
    ...overrides,
  };
}

describe("réconciliation entre la base Neon et le cache navigateur", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("la fiche serveur remplace son équivalent local, même si l'URL est écrite différemment", () => {
    const merged = mergeServerRecords([serverRecord()], [localEntry()]);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("obs_1");
    expect(merged[0].observationCount).toBe(2);
    // Ce que le serveur ne connaît pas est conservé plutôt que perdu.
    expect(merged[0].comparableNames).toEqual(["v0.dev"]);
    expect(merged[0].lastPack.id).toBe("pack-local");
  });

  it("conserve une observation faite pendant que l'API était injoignable", () => {
    const orphan = localEntry({ id: "memory-orphan", sourceValue: "https://autre-outil.dev" });
    const merged = mergeServerRecords([serverRecord()], [localEntry(), orphan]);

    expect(merged.map((entry) => entry.id).sort()).toEqual(["memory-orphan", "obs_1"]);
  });

  it("un compteur vide côté navigateur se remplit depuis le serveur", async () => {
    expect(loadObservationMemory()).toHaveLength(0);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ configured: true, sources: [serverRecord()] })));

    const synced = await syncObservationMemoryFromServer();

    expect(synced?.entries).toHaveLength(1);
    expect(synced?.pushed).toBe(0);
    expect(loadObservationMemory()[0].name).toBe("lovable.dev");
  });

  it("garde le cache en place quand l'API est injoignable, au lieu de vider la page", async () => {
    saveObservationMemory([localEntry()]);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));

    expect(await syncObservationMemoryFromServer()).toBeNull();
    expect(loadObservationMemory()).toHaveLength(1);
  });
});

describe("remontée des fiches qui n'existaient que dans ce navigateur", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("pousse une fiche locale vers la base, puis la relit sous son identité serveur", async () => {
    saveObservationMemory([localEntry({ id: "memory-local", sourceValue: "https://lovable.dev" })]);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        return jsonResponse({ status: "ok", source: serverRecord({ id: "obs_pushed", observationCount: 1 }) });
      }
      expect(url).toContain("/observatory/sources");
      return jsonResponse({ configured: true, sources: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const synced = await syncObservationMemoryFromServer();

    expect(synced?.pushed).toBe(1);
    expect(synced?.failed).toBe(0);
    expect(synced?.entries).toHaveLength(1);
    // La fiche a désormais l'identité que la base lui a donnée : c'est elle
    // que le job nocturne verra.
    expect(synced?.entries[0].id).toBe("obs_pushed");
    expect(loadObservationMemory()[0].id).toBe("obs_pushed");
  });

  it("ne repousse pas une fiche que le serveur connaît déjà", async () => {
    saveObservationMemory([localEntry({ sourceValue: "https://deja-connu.dev" })]);
    const known = serverRecord({ id: "obs_known", value: "https://www.deja-connu.dev/", sourceKey: "deja-connu.dev" });
    const fetchMock = vi.fn(async () => jsonResponse({ configured: true, sources: [known] }));
    vi.stubGlobal("fetch", fetchMock);

    const synced = await syncObservationMemoryFromServer();

    expect(synced?.pushed).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reporte la décision déjà prise localement sur la fiche créée en base", async () => {
    saveObservationMemory([localEntry({ sourceValue: "https://a-classer.dev", currentDecision: "harvest" })]);
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        return jsonResponse(url.includes("/decision")
          ? { status: "ok", source: serverRecord({ id: "obs_pushed", decision: "harvest" }) }
          : { status: "ok", source: serverRecord({ id: "obs_pushed" }) });
      }
      return jsonResponse({ configured: true, sources: [] });
    }));

    const synced = await syncObservationMemoryFromServer();

    expect(calls.map((call) => call.url.endsWith("/decision"))).toEqual([false, true]);
    expect(calls[1].body).toEqual({ decision: "harvest" });
    expect(synced?.entries[0].currentDecision).toBe("harvest");
  });

  it("compte l'échec sans perdre la fiche locale, et ne réessaie pas en boucle", async () => {
    saveObservationMemory([localEntry({ sourceValue: "https://echec.dev" })]);
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return jsonResponse({ error: "source invalide" }, 400);
      return jsonResponse({ configured: true, sources: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await syncObservationMemoryFromServer();
    expect(first?.failed).toBe(1);
    expect(loadObservationMemory()).toHaveLength(1);

    // Deuxième synchro dans la même session : plus de POST, seulement la
    // lecture. Recharger la page reste le geste pour réessayer.
    fetchMock.mockClear();
    const second = await syncObservationMemoryFromServer();
    expect(second?.failed).toBe(0);
    expect(fetchMock.mock.calls.every(([, init]) => init?.method !== "POST")).toBe(true);
  });
});
