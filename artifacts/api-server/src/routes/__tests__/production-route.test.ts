import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

const composio = vi.hoisted(() => ({
  configured: true,
  accounts: [] as Array<{ id: string; toolkitSlug: string; status: string; raw: unknown }>,
  executeResult: {} as unknown,
}));

vi.mock("../../services/composio", () => ({
  isComposioConfigured: () => composio.configured,
  isActiveComposioStatus: (status: string) => status === "ACTIVE",
  listComposioConnectedAccounts: async () => composio.accounts,
  executeComposioTool: async () => composio.executeResult,
}));

async function makeApp() {
  const { default: productionRouter } = await import("../production");
  const app = express();
  app.use(express.json());
  app.use("/production", productionRouter);
  const server = app.listen(0);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

describe("production route", () => {
  afterEach(() => {
    composio.configured = true;
    composio.accounts = [];
    composio.executeResult = {};
    vi.resetModules();
    delete process.env.MISTRAL_API_KEY;
    delete process.env.AI_API_KEY;
  });

  it("returns diagnostics without exposing secrets", async () => {
    process.env.MISTRAL_API_KEY = "secret-key";
    composio.accounts = [{ id: "canva-1", toolkitSlug: "canva", status: "ACTIVE", raw: {} }];
    const { server, baseUrl } = await makeApp();
    try {
      const response = await fetch(`${baseUrl}/production/diagnostics`);
      const body = await response.json() as { error: string };
      expect(response.ok).toBe(true);
      expect(body).toEqual({
        composio: { configured: true, canvaConnected: true },
        mistral: { configured: true, available: true },
      });
      expect(JSON.stringify(body)).not.toContain("secret-key");
    } finally {
      server.close();
    }
  });

  it("blocks Canva execution when Canva is not connected", async () => {
    const { server, baseUrl } = await makeApp();
    try {
      const response = await fetch(`${baseUrl}/production/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: "canva", action: "create_design", input: { title: "TERRA" } }),
      });
      const body = await response.json() as { status: string; artifact: { id: string; kind: string; url: string; downloadUrl: string | null } };
      expect(response.status).toBe(409);
      expect(body.error).toBe("Canva nécessite une connexion ou une autorisation.");
    } finally {
      server.close();
    }
  });

  it("returns a Canva artifact only when Composio provides a real URL", async () => {
    composio.accounts = [{ id: "canva-1", toolkitSlug: "canva", status: "ACTIVE", raw: {} }];
    composio.executeResult = { data: { design: { id: "design-1", urls: { view_url: "https://canva.example/design-1" } } } };
    const { server, baseUrl } = await makeApp();
    try {
      const response = await fetch(`${baseUrl}/production/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: "canva", action: "create_design", input: { title: "TERRA" } }),
      });
      const body = await response.json();
      expect(response.ok).toBe(true);
      expect(body.status).toBe("completed");
      expect(body.artifact).toMatchObject({
        id: "design-1",
        kind: "instagram-visual",
        url: "https://canva.example/design-1",
        downloadUrl: null,
      });
    } finally {
      server.close();
    }
  });
});
