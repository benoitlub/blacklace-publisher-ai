import { describe, it, expect } from "vitest";
import { forwardMetricoolPublication } from "./metricool-forward";

describe("local Octopus adapter to Worker", () => {
  it("requires a server token before a write and never puts it in the mission body", async () => {
    let calls = 0;
    const fetchImpl = async (_input: unknown, init?: RequestInit) => {
      calls++;
      expect(init?.headers).toMatchObject({ Authorization: "Bearer simulated-test-token" });
      expect(init?.body).not.toContain("simulated-test-token");
      return Response.json({ status: "confirmed-scheduled", scheduled: true, postId: "42" });
    };
    const request = { operationId: "operation", dryRun: false };
    expect((await forwardMetricoolPublication(request, { workerUrl: "https://publisher.test", fetchImpl: fetchImpl as typeof fetch })).scheduled).toBe(false);
    expect(calls).toBe(0);
    expect((await forwardMetricoolPublication(request, { workerUrl: "https://publisher.test", token: "simulated-test-token", fetchImpl: fetchImpl as typeof fetch })).postId).toBe("42");
    expect(calls).toBe(1);
  });
  it("does not retry transport timeouts or claim success from a non-JSON response", async () => {
    let calls = 0;
    const output = await forwardMetricoolPublication({ operationId: "op", dryRun: false }, { workerUrl: "https://publisher.test", token: "simulated-test-token", fetchImpl: async () => { calls++; throw new Error("timeout"); } });
    expect(calls).toBe(1); expect(output.scheduled).toBe(false); expect(output.retryAllowed).toBe(false);
  });
  it("keeps the default request read-only", async () => {
    await forwardMetricoolPublication({ operationId: "op" }, { workerUrl: "https://publisher.test", fetchImpl: async (_url, init) => {
      expect(JSON.parse(String(init?.body)).dryRun).toBe(true);
      return Response.json({ status: "ready-to-schedule", scheduled: false });
    } });
  });
});

it("uses only the requested transport's credential and rejects unknown destinations", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async (_url, init) => {
    calls++; expect(init?.headers).toMatchObject({ Authorization: "Bearer buffer-only" });
    expect(init?.body).not.toContain("buffer-only");
    expect(JSON.parse(String(init?.body)).transport).toBe("buffer");
    return Response.json({ status: "ready-to-schedule", scheduled: false });
  };
  await forwardMetricoolPublication({ transport: "buffer" }, { workerUrl: "https://publisher.test", token: "metricool-only", bufferToken: "buffer-only", fetchImpl });
  await forwardMetricoolPublication({ transport: "buffer", dryRun: false }, { workerUrl: "https://publisher.test", token: "metricool-only", fetchImpl });
  await forwardMetricoolPublication({ transport: "unknown" }, { workerUrl: "https://publisher.test", token: "metricool-only", fetchImpl });
  expect(calls).toBe(1);
});
