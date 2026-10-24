import { it, expect } from "vitest";
import { forwardComposioMission } from "./composio-forward";
it("forwards the business envelope to the credential-owning Worker without inventing a local tool ID", async () => {
  const mission = {
    mission: {
      operationId: "read-1",
      requiredCapabilities: ["business.sources.search"],
      authorizedResources: ["tools.read"],
      context: { metadata: { toolRequest: { dryRun: true } } },
    },
  };
  const result = await forwardComposioMission(mission, {
    workerUrl: "https://worker.test/",
    fetchImpl: async (url, init) => {
      expect(url).toBe("https://worker.test/api/octopus-adapter/execute");
      expect(JSON.parse(String(init?.body))).toEqual(mission);
      expect(init?.headers).not.toHaveProperty("Authorization");
      return Response.json({
        operationId: "read-1",
        status: "completed",
        output: {
          capability: "business.sources.search",
          status: "ready-to-read",
          executed: false,
        },
      });
    },
  });
  expect(result.status).toBe("completed");
  expect(result.output.executed).toBe(false);
});
it("non-JSON, HTTP errors and application-invalid responses never turn into search success or retries", async () => {
  for (const response of [
    new Response("blocked", { status: 403 }),
    Response.json({ status: "ok" }),
    Response.json({ status: "completed" }),
  ]) {
    let calls = 0;
    const result = await forwardComposioMission(
      {},
      {
        workerUrl: "https://worker.test",
        fetchImpl: async () => {
          calls++;
          return response;
        },
      },
    );
    expect(result.status).toBe("needs-input");
    expect(result.output.candidates).toEqual([]);
    expect(result.output.retryAllowed).toBe(false);
    expect(calls).toBe(1);
  }
});
