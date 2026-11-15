import { describe, it, expect, vi } from "vitest";
import { agnesConfigured, submitAgnesVideo, pollAgnesVideo } from "./agnes";

describe("Agnes Flash spend guard and task contract", () => {
  it("requires explicit authorization and zero-cost confirmation before network access", async () => {
    const fetcher = vi.fn();
    await expect(submitAgnesVideo("A fox", { authorized: true, confirmedZeroCost: false, key: "fake", fetcher })).rejects.toThrow("AGNES_COST_OR_AUTHORIZATION_UNVERIFIED");
    await expect(submitAgnesVideo("A fox", { authorized: false, confirmedZeroCost: true, key: "fake", fetcher })).rejects.toThrow("AGNES_COST_OR_AUTHORIZATION_UNVERIFIED");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("never submits without a key", async () => {
    const fetcher = vi.fn();
    await expect(submitAgnesVideo("A fox", { authorized: true, confirmedZeroCost: true, key: "", fetcher })).rejects.toThrow("AGNES_API_KEY_MISSING");
    expect(fetcher).not.toHaveBeenCalled();
    expect(agnesConfigured({ AGNES_API_KEY: "secret" } as NodeJS.ProcessEnv)).toBe(true);
  });
  it("accepts only a real provider task id", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ video_id: "task_123" }));
    await expect(submitAgnesVideo("A fox", { authorized: true, confirmedZeroCost: true, key: "fake", fetcher })).resolves.toEqual({ video_id: "task_123" });
    expect(fetcher).toHaveBeenCalledOnce();
    const request = fetcher.mock.calls[0][1];
    expect(JSON.parse(request.body).model).toBe("agnes-video-2.5-flash");
  });
  it("does not expose or download arbitrary video URLs", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ status: "completed", video_url: "http://localhost/private" }));
    await expect(pollAgnesVideo("task_123", { key: "fake", fetcher })).resolves.toEqual({ status: "completed" });
    expect(fetcher).toHaveBeenCalledOnce();
    await expect(pollAgnesVideo("../../bad", { key: "fake", fetcher })).rejects.toThrow("AGNES_TASK_ID_INVALID");
  });
});
