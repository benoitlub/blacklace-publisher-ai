import express from "express";
import { afterEach, describe, expect, it } from "vitest";

async function makeApp() {
  const { default: productionRouter } = await import("../routes/production");
  const app = express();
  app.use(express.json());
  app.use("/production", productionRouter);
  const server = app.listen(0);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

describe("copy.generate production adapter", () => {
  afterEach(() => {
    delete process.env.MISTRAL_API_KEY;
    delete process.env.AI_API_KEY;
    delete process.env.AI_PROVIDER;
  });

  it("returns a completed Markdown artifact through Production Engine", async () => {
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
        artifact: {
          producerId: string;
          content: string;
          mimeType: string;
          metadata: { status: string; provider: string };
        };
      };

      expect(response.ok).toBe(true);
      expect(body.status).toBe("completed");
      expect(body.action).toBe("COPY_GENERATE");
      expect(body.artifact.producerId).toBe("mistral-copy");
      expect(body.artifact.mimeType).toBe("text/markdown");
      expect(body.artifact.metadata.status).toBe("completed");
      expect(body.artifact.metadata.provider).toBe("mock");
      expect(body.artifact.content).toContain("# Récolte Yael");
    } finally {
      server.close();
    }
  });
});
