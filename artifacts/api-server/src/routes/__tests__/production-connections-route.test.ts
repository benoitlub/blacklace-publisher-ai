import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

const composio = vi.hoisted(() => ({
  configured: true,
  accounts: [] as Array<{ id: string; toolkitSlug: string; status: string; raw: unknown }>,
  authConfigId: "auth-canva-1" as string | null,
  connection: {
    id: "connection-1",
    redirectUrl: "https://connect.composio.dev/canva-test",
    status: "INITIATED",
    raw: {},
  },
}));

vi.mock("../../services/composio", () => ({
  isComposioConfigured: () => composio.configured,
  isActiveComposioStatus: (status: string) => status === "ACTIVE",
  listComposioConnectedAccounts: async () => composio.accounts,
  findComposioAuthConfig: async () => composio.authConfigId,
  initiateComposioConnection: async () => composio.connection,
}));

async function makeApp() {
  const { default: router } = await import("../production-connections");
  const app = express();
  app.use(express.json());
  app.use("/production", router);
  const server = app.listen(0);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

describe("production connections route", () => {
  afterEach(() => {
    composio.configured = true;
    composio.accounts = [];
    composio.authConfigId = "auth-canva-1";
    composio.connection = {
      id: "connection-1",
      redirectUrl: "https://connect.composio.dev/canva-test",
      status: "INITIATED",
      raw: {},
    };
    vi.resetModules();
  });

  it("returns the real Composio authorization URL", async () => {
    const { server, baseUrl } = await makeApp();
    try {
      const response = await fetch(`${baseUrl}/production/connections/canva/connect`, {
        method: "POST",
      });
      const body = await response.json() as {
        status: string;
        toolkit: string;
        userId: string;
        redirectUrl: string;
      };
      expect(response.status).toBe(201);
      expect(body).toMatchObject({
        status: "waiting-authorization",
        toolkit: "canva",
        userId: "benoit-lubert",
        redirectUrl: "https://connect.composio.dev/canva-test",
      });
    } finally {
      server.close();
    }
  });

  it("redirects the browser to Composio authorization", async () => {
    const { server, baseUrl } = await makeApp();
    try {
      const response = await fetch(`${baseUrl}/production/connections/canva/authorize`, {
        redirect: "manual",
      });
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("https://connect.composio.dev/canva-test");
    } finally {
      server.close();
    }
  });

  it("does not create a second connection when Canva is already active", async () => {
    composio.accounts = [{ id: "canva-active", toolkitSlug: "canva", status: "ACTIVE", raw: {} }];
    const { server, baseUrl } = await makeApp();
    try {
      const response = await fetch(`${baseUrl}/production/connections/canva/connect`, {
        method: "POST",
      });
      const body = await response.json() as {
        status: string;
        connectedAccountId: string;
        redirectUrl: null;
      };
      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        status: "connected",
        connectedAccountId: "canva-active",
        redirectUrl: null,
      });
    } finally {
      server.close();
    }
  });
});
