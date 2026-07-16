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
      const body = await response.json() as {
        composio: {
          configured: boolean;
          canvaConnected: boolean;
          elevenLabsConnected: boolean;
          connectedAccount: string | null;
          connectedAccounts: Array<{ id: string; toolkitSlug: string; status: string }>;
          availableActions: Array<{ slug: string; requiredFields: string[] }>;
        };
        canva: { status: string; connected: boolean; connectedAccount: string | null };
        elevenLabs: { status: string; connected: boolean; connectedAccount: string | null };
        mistral: { configured: boolean; available: boolean };
      };
      expect(response.ok).toBe(true);
      expect(body).toMatchObject({
        composio: {
          configured: true,
          canvaConnected: true,
          elevenLabsConnected: false,
          connectedAccount: "canva-1",
          connectedAccounts: [{ id: "canva-1", toolkitSlug: "canva", status: "ACTIVE" }],
          availableActions: expect.arrayContaining([
            expect.objectContaining({ slug: "CANVA_POST_DESIGNS", requiredFields: ["design_type"] }),
          ]),
        },
        canva: { status: "connected", connected: true, connectedAccount: "canva-1" },
        elevenLabs: { status: "not-connected", connected: false, connectedAccount: null },
        mistral: { configured: true, available: true },
      });
      expect(JSON.stringify(body)).not.toContain("secret-key");
    } finally {
      server.close();
    }
  });

  it("reports ElevenLabs as connected when Composio has an active account", async () => {
    composio.accounts = [
      { id: "canva-1", toolkitSlug: "canva", status: "ACTIVE", raw: {} },
      { id: "eleven-1", toolkitSlug: "elevenlabs", status: "ACTIVE", raw: {} },
    ];
    const { server, baseUrl } = await makeApp();
    try {
      const response = await fetch(`${baseUrl}/production/diagnostics`);
      const body = await response.json() as {
        composio: { elevenLabsConnected: boolean };
        elevenLabs: { status: string; connected: boolean; connectedAccount: string | null };
      };
      expect(response.ok).toBe(true);
      expect(body.composio.elevenLabsConnected).toBe(true);
      expect(body.elevenLabs).toMatchObject({
        status: "connected",
        connected: true,
        connectedAccount: "eleven-1",
      });
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
      const body = await response.json() as { error: string };
      expect(response.status).toBe(409);
      expect(body.error).toBe("Canva nécessite une connexion ou une autorisation.");
    } finally {
      server.close();
    }
  });

  it("returns a ProductionPlan for a landing page", async () => {
    const { server, baseUrl } = await makeApp();
    try {
      const response = await fetch(`${baseUrl}/production/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capability: "landing-page", input: { title: "Yaebali" } }),
      });
      const body = await response.json() as { plan: { status: string; steps: Array<{ producerId: string | null }> } };

      expect(response.ok).toBe(true);
      expect(body.plan.status).toBe("ready");
      expect(body.plan.steps[0]?.producerId).toBe("html-local");
    } finally {
      server.close();
    }
  });

  it("executes landing-page through Production Engine HTML local", async () => {
    const { server, baseUrl } = await makeApp();
    try {
      const response = await fetch(`${baseUrl}/production/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: "html-local", action: "create_landing_page", input: { title: "Yaebali" } }),
      });
      const body = await response.json() as { status: string; tool: string; artifact: { producerId: string; content: string } };

      expect(response.ok).toBe(true);
      expect(body.status).toBe("completed");
      expect(body.tool).toBe("html-local");
      expect(body.artifact.producerId).toBe("html-local");
      expect(body.artifact.content).toContain("<main");
      expect(body.artifact.content).toContain("Yaebali");
    } finally {
      server.close();
    }
  });

  it("executes copy.generate through Production Engine and returns a completed Markdown artifact", async () => {
    const { server, baseUrl } = await makeApp();
    try {
      const response = await fetch(`${baseUrl}/production/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capability: "copy.generate",
          requestId: "copy-yael",
          input: {
            title: "Récolte Yael",
            prompt: "Trouve un prospect intéressant pour Yael.",
          },
        }),
      });
      const body = await response.json() as {
        status: string;
        action: string;
        artifact: { producerId: string; content: string; mimeType: string; metadata: { status: string } };
      };

      expect(response.ok).toBe(true);
      expect(body.status).toBe("completed");
      expect(body.action).toBe("COPY_GENERATE");
      expect(body.artifact.producerId).toBe("mistral-copy");
      expect(body.artifact.mimeType).toBe("text/markdown");
      expect(body.artifact.metadata.status).toBe("completed");
      expect(body.artifact.content).toContain("# Récolte Yael");
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
      const body = await response.json() as {
        status: string;
        action: string;
        artifact: { id: string; kind: string; url: string; downloadUrl: string | null; rawReference: { designId: string } };
      };
      expect(response.ok).toBe(true);
      expect(body.status).toBe("completed");
      expect(body.action).toBe("CANVA_POST_DESIGNS");
      expect(body.artifact).toMatchObject({
        id: "design-1",
        kind: "instagram-visual",
        url: "https://canva.example/design-1",
        downloadUrl: null,
        rawReference: { designId: "design-1" },
      });
    } finally {
      server.close();
    }
  });
});
