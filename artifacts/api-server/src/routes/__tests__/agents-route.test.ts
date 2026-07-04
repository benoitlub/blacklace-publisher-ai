import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

const { sourceAgents } = vi.hoisted(() => ({
  sourceAgents: [
    {
      id: 1,
      name: "Feuch",
      role: "Feuch role",
      tone: "Feuch tone",
      missions: null,
      limits: null,
      examplePhrases: null,
      color: null,
      avatar: null,
      isActive: true,
      createdAt: new Date("2026-01-02T00:00:00.000Z")
    },
    {
      id: 2,
      name: "Clochette",
      role: "Clochette role",
      tone: "Clochette tone",
      missions: null,
      limits: null,
      examplePhrases: null,
      color: null,
      avatar: null,
      isActive: true,
      createdAt: new Date("2026-01-02T00:00:00.000Z")
    }
  ]
}));

vi.mock("@workspace/db", () => ({
  agentsTable: { id: "id" },
  insertAgentSchema: {
    safeParse: () => ({ success: true, data: {} }),
    partial: () => ({ safeParse: () => ({ success: true, data: {} }) })
  },
  db: {
    select: () => ({
      from: () => ({
        orderBy: async () => sourceAgents,
        where: async () => []
      })
    }),
    insert: () => ({ values: () => ({ returning: async () => [] }) }),
    update: () => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) }),
    delete: () => ({ where: async () => undefined })
  }
}));

describe("agent and persona routes", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it.each(["/agents", "/personas"])("%s returns source agents plus missing base fallback agents", async (path) => {
    const { default: agentsRouter } = await import("../agents");
    const { default: personasRouter } = await import("../personas");
    const app = express();
    app.use("/agents", agentsRouter);
    app.use("/personas", personasRouter);

    const server = app.listen(0);
    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Test server did not expose a port");
      }

      const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
      const agents = (await response.json()) as Array<{ readonly name: string }>;

      expect(response.ok).toBe(true);
      expect(agents).toHaveLength(6);
      expect(agents.map((agent) => agent.name)).toEqual(
        expect.arrayContaining(["Natasha", "Marty", "Feuch", "Birdy", "Clochette", "Sofia"])
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
