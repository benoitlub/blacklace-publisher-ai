import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  observations: [] as Array<{ key: string; value: unknown }>,
  connections: [] as Array<{ key: string; value: unknown }>,
}));

const composio = vi.hoisted(() => ({
  configured: true,
  accounts: [] as Array<{ id: string; toolkitSlug: string; status: string; raw: unknown }>,
}));

vi.mock("../services/global-state", () => ({
  listGlobalState: async (namespace: string) => namespace === "observations" ? state.observations : state.connections,
  readGlobalState: async () => null,
}));

vi.mock("../services/composio", () => ({
  isComposioConfigured: () => composio.configured,
  isActiveComposioStatus: (status: string) => status === "ACTIVE",
  listComposioConnectedAccounts: async () => composio.accounts,
}));

async function makeApp() {
  const { default: router } = await import("../routes/connection-broker");
  const app = express();
  app.use(express.json());
  app.use("/connection-broker", router);
  const server = app.listen(0);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

describe("connection broker route", () => {
  afterEach(() => {
    state.observations = [];
    state.connections = [];
    composio.configured = true;
    composio.accounts = [];
    vi.resetModules();
  });

  it("uses server-confirmed Canva instead of stale connection state", async () => {
    state.connections = [{
      key: "canva",
      value: {
        provider: "canva",
        status: "authorization-required",
        route: "composio",
        authorization: "required",
        creditStatus: "unknown",
      },
    }];
    composio.accounts = [{ id: "canva-1", toolkitSlug: "canva", status: "ACTIVE", raw: {} }];

    const { server, baseUrl } = await makeApp();
    try {
      const response = await fetch(`${baseUrl}/connection-broker/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seedId: "seed-420",
          step: { id: "demo-visual", role: "visual", providers: ["Canva"] },
        }),
      });
      const body = await response.json() as {
        selected: { connectionStatus: string; authorization: string; route: string; notes: string };
        executable: boolean;
        requiresHumanAuthorization: boolean;
      };

      expect(response.ok).toBe(true);
      expect(body.selected).toMatchObject({
        connectionStatus: "connected",
        authorization: "granted",
        route: "composio",
        notes: "Confirmed by Publisher Local technique",
      });
      expect(body.executable).toBe(true);
      expect(body.requiresHumanAuthorization).toBe(false);
    } finally {
      server.close();
    }
  });

  it("does not let an unrequested Metricool connection block another step", async () => {
    composio.accounts = [{ id: "canva-1", toolkitSlug: "canva", status: "ACTIVE", raw: {} }];

    const { server, baseUrl } = await makeApp();
    try {
      const response = await fetch(`${baseUrl}/connection-broker/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seedId: "seed-420",
          step: { id: "demo-visual", role: "visual", providers: ["Canva"] },
        }),
      });
      const body = await response.json() as { selected: { name: string; connectionStatus: string }; executable: boolean };

      expect(response.ok).toBe(true);
      expect(body.selected.name).toBe("Canva");
      expect(body.selected.connectionStatus).toBe("connected");
      expect(body.executable).toBe(true);
    } finally {
      server.close();
    }
  });
});
