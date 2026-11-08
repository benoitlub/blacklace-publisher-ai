import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runStudio } from "./engine";
import { produceImage } from "./image";
import { command, artifactPath, hash, probe } from "./runtime";

const request = {
  version: "studio-v1" as const, parcelId: "test-parcel", seedId: "test-seed",
  operationId: "test-image", durationSeconds: 18, title: "Fixture only",
  imagePrompt: "Original parcel visual",
  authorizedResources: ["image.studio", "mistral.image"], automaticPublication: false as const,
};
const generated = { conversation_id: "test-conversation", outputs: [{
  type: "message.output", role: "assistant", content: [{
    type: "tool_file", tool: "image_generation", file_id: "test-image", file_type: "png",
  }],
}] };
const dirs: string[] = [];
async function setup() {
  const dir = await mkdtemp(path.join(tmpdir(), "mistral-studio-test-"));
  dirs.push(dir);
  vi.stubEnv("PUBLISHER_STUDIO_DIR", dir);
  vi.stubEnv("MISTRAL_API_KEY", "test-mistral-key");
  vi.stubEnv("AI_API_KEY", "wrong-generic-key");
  return dir;
}
async function fixture(dir: string) {
  const file = path.join(dir, "fixture.png");
  await command("ffmpeg", ["-v", "error", "-nostdin", "-y", "-f", "lavfi", "-i",
    "color=c=purple:s=320x568", "-frames:v", "1", "-threads", "1", file]);
  return readFile(file);
}
afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers();
  await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true })));
});
describe("Mistral image transport and safe Studio resumption", () => {
  it("uses the configured local key and verifies a real PNG, then reuses the verified archive", async () => {
    const dir = await setup(), png = await fixture(dir);
    const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      expect((init?.headers as any).Authorization).toBe("Bearer test-mistral-key");
      if (String(url) === "https://api.mistral.ai/v1/conversations") return Response.json(generated);
      expect(String(url)).toBe("https://api.mistral.ai/v1/files/test-image/content");
      return new Response(png, { headers: { "content-type": "image/png" } });
    });
    const r = await runStudio(request, "image.studio");
    expect(r.status).toBe("ready-for-review");
    expect((r as any).image).toMatchObject({ fileId: "test-image", conversationId: "test-conversation", transport: "direct", verifiedFile: true });
    expect(r.published).toBe(false);
    const bytes = await readFile(artifactPath(r.id, "image.png"));
    expect(hash(bytes)).toBe((r as any).artifact.sha256);
    const p = await probe(artifactPath(r.id, "image.png"));
    expect(p.streams[0]).toMatchObject({ width: 1080, height: 1920, codec_name: "png" });
    expect((await runStudio(request, "image.studio")).reused).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("preserves 429 and waits before safely retrying the same operation", async () => {
    const dir = await setup(), png = await fixture(dir);
    const fetcher = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "120" } }))
      .mockResolvedValueOnce(Response.json(generated))
      .mockResolvedValueOnce(new Response(png, { headers: { "content-type": "image/png" } }));
    const r = await runStudio(request, "image.studio");
    expect(r).toMatchObject({ status: "failed", httpStatus: 429, code: "MISTRAL_IMAGE_RATE_LIMITED", retryAllowed: true, providerOutcomeMayBeUnknown: false });
    expect((await runStudio(request, "image.studio")).reused).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    // Move only the persisted deadline, without sleeping or bypassing permissions.
    await writeFile(artifactPath(r.id, "report.json"), JSON.stringify({ ...r, retryAt: new Date(Date.now() - 1).toISOString() }));
    const retries = await Promise.all([runStudio(request, "image.studio"), runStudio(request, "image.studio")]);
    const recovered = retries.find(r => r.status === "ready-for-review");
    expect(recovered?.status).toBe("ready-for-review");
    expect(recovered?.attempt).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("after a failed download retries only the saved file, never the paid conversation", async () => {
    const dir = await setup(), png = await fixture(dir);
    const fetcher = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(generated))
      .mockRejectedValueOnce(new Error("interrupted retrieval"))
      .mockResolvedValueOnce(new Response(png, { headers: { "content-type": "image/png" } }));
    const r = await runStudio(request, "image.studio");
    expect(r).toMatchObject({ status: "failed", code: "MISTRAL_IMAGE_NETWORK_FAILED", retryAllowed: true });
    await writeFile(artifactPath(r.id, "report.json"), JSON.stringify({ ...r, retryAt: new Date(Date.now() - 1).toISOString() }));
    expect((await runStudio(request, "image.studio")).status).toBe("ready-for-review");
    expect(fetcher.mock.calls.map(c => String(c[0]))).toEqual([
      "https://api.mistral.ai/v1/conversations",
      "https://api.mistral.ai/v1/files/test-image/content",
      "https://api.mistral.ai/v1/files/test-image/content",
    ]);
  });
  it("no file or an uncertain conversation never authorizes automatic regeneration", async () => {
    await setup();
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      conversation_id: "no-file", outputs: [],
    }));
    const r = await runStudio(request, "image.studio");
    expect(r).toMatchObject({ status: "failed", code: "MISTRAL_IMAGE_FILE_MISSING", retryAllowed: false, providerOutcomeMayBeUnknown: true });
    expect((await runStudio(request, "image.studio")).reused).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("explicit refusal wins even when a local key is available", async () => {
    const dir = await setup(), fetcher = vi.fn();
    await expect(produceImage({ ...request, authorizedResources: ["image.studio"] }, dir, fetcher)).rejects.toThrow("STUDIO_AUTHORIZATION_REQUIRED");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
