import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtemp, writeFile, readFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { validateRequest } from "./request";
import { runStudio, executeStudioMission } from "./engine";
import { artifactPath, hash, registeredAsset } from "./runtime";
import { scriptFor, loudnessJson, originalSoundtrack } from "./audio";
import { captionLines } from "./video";
import { produceImage } from "./image";
import { checkAgnesZeroCost, generateAgnesClip } from "./agnes";
const input = {
  version: "studio-v1",
  operationId: "test",
  seedId: "seed-other",
  parcelId: "another-parcel",
  title: "Autre univers",
  durationSeconds: 18,
  assetId: "another-image",
  segments: [
    { text: "Une phrase française.", caption: "Une phrase française." },
  ],
  scriptRights: {
    source: "https://example.org/official",
    attribution: "Auteur de cette parcelle",
  },
  authorizedResources: ["video.studio"],
  automaticPublication: false,
};
const dirs: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await Promise.all(
    dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});
describe("studio authorization, provenance and meaningful failure states", () => {
  it("fails closed before all Agnes network calls unless server grants recent zero-price proof", async () => {
    const fetcher = vi.fn();
    const clip = { prompt: "Three dice roll on a tabletop", seconds: 4 };
    vi.stubEnv("AGNES_API_KEY", "test-only");
    vi.stubEnv("AGNES_ZERO_COST_USD_PER_SECOND", "0");
    await expect(generateAgnesClip(clip, "/tmp", fetcher as any)).rejects.toThrow("AGNES_ZERO_COST_NOT_VERIFIED");
    expect(fetcher).not.toHaveBeenCalled();
    const now = Date.now();
    vi.stubEnv("AGNES_ZERO_COST_VERIFIED_AT", new Date(now - 60000).toISOString());
    vi.stubEnv("AGNES_ZERO_COST_EXPIRES_AT", new Date(now + 60000).toISOString());
    expect(() => checkAgnesZeroCost(clip, now)).not.toThrow();
    vi.stubEnv("AGNES_ZERO_COST_USD_PER_SECOND", "0.025");
    expect(() => checkAgnesZeroCost(clip, now)).toThrow("AGNES_ZERO_COST_NOT_VERIFIED");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("requires an explicit Agnes permission and rejects spoofed clip properties", () => {
    const valid = { ...input, agnesClip: { prompt: "Three dice visibly roll", seconds: 4 }, authorizedResources: ["video.studio", "agnes.video"] };
    expect(validateRequest(valid).agnesClip?.seconds).toBe(4);
    expect(() => validateRequest({ ...valid, authorizedResources: ["video.studio"] })).toThrow("AGNES_STUDIO_AUTHORIZATION_REQUIRED");
    expect(() => validateRequest({ ...valid, agnesClip: { ...valid.agnesClip, url: "https://example.org" } })).toThrow("INVALID_STUDIO_REQUEST");
  });
  it("a provider file identifier and image-like signature never prove a decodable image", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "studio-fake-image-"));
    dirs.push(dir);
    let count = 0;
    const fetcher = async () =>
      ++count === 1
        ? Response.json({
            status: "generated",
            result: { fileId: "fixture-only" },
          })
        : new Response(
            Buffer.concat([
              Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
              Buffer.alloc(1200),
            ]),
          );
    await expect(
      produceImage(
        {
          ...input,
          assetId: undefined,
          imagePrompt: "Own parcel subject",
          authorizedResources: ["image.studio", "mistral.image"],
        } as any,
        dir,
        fetcher as any,
      ),
    ).rejects.toThrow(/FF(PROBE|MPEG)_COMMAND_FAILED/);
    expect(count).toBe(2);
  });
  it("accepts bounded owner creative guidance but rejects cross-contract or oversized instructions", () => {
    const feedback = [{
      feedbackId: "benoit-420-dice-short-2026-10-26",
      creativeGuidance: ["Animate the dice and vary the shots", "Keep the French voice"],
      prohibitedActions: ["Do not publish"],
    }];
    const valid = validateRequest({ ...input, creativeFeedback: feedback });
    expect(valid.creativeFeedback).toEqual(feedback);
    expect(valid.automaticPublication).toBe(false);
    for (const wrong of [
      [{ ...feedback[0], parcelId: "other" }],
      [{ ...feedback[0], creativeGuidance: ["x".repeat(241)] }],
      [{ ...feedback[0], prohibitedActions: "publish" }],
      Array.from({ length: 9 }, () => feedback[0]),
    ]) expect(() => validateRequest({ ...input, creativeFeedback: wrong })).toThrow("INVALID_STUDIO_REQUEST");
  });
  it("rejects missing permission, unknown fields, publication and oversized scripts before rendering", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    await expect(
      runStudio({ ...input, authorizedResources: [] }),
    ).rejects.toThrow("STUDIO_AUTHORIZATION_REQUIRED");
    for (const change of [
      { automaticPublication: true },
      { url: "http://localhost/private" },
      { segments: [{ text: "ok", caption: "{\\an8}injection" }] },
      { durationSeconds: NaN },
    ])
      expect(() => validateRequest({ ...input, ...change })).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects cross-parcel envelope and cannot use nested authorizations to bypass the envelope", async () => {
    const mission = {
      operationId: "test",
      requiredCapabilities: ["video.studio"],
      authorizedResources: [],
      context: {
        id: input.parcelId,
        metadata: { seedId: input.seedId, studioRequest: input },
      },
    };
    expect((await executeStudioMission(mission)).output.code).toBe(
      "STUDIO_AUTHORIZATION_REQUIRED",
    );
    expect(
      (
        await executeStudioMission({
          ...mission,
          context: { ...mission.context, id: "wrong-parcel" },
        })
      ).output.code,
    ).toBe("STUDIO_PARCEL_MISMATCH");
  });
  it("keeps approved text distinct from Mistral; generation needs explicit permission and valid structured output", async () => {
    const generate = vi.fn();
    expect((await scriptFor(input as any, generate)).provider).toBe(
      "approved-parcel-script",
    );
    expect(generate).not.toHaveBeenCalled();
    const request = {
      ...input,
      segments: undefined,
      scriptRights: undefined,
      knowledge: "Contexte de cette parcelle uniquement.",
    };
    await expect(scriptFor(request as any, generate)).rejects.toThrow(
      "STUDIO_AUTHORIZATION_REQUIRED",
    );
    const authorized = {
      ...request,
      authorizedResources: ["video.studio", "mistral.text"],
    };
    generate.mockResolvedValueOnce({
      content: JSON.stringify({ segments: input.segments }),
      metadata: { provider: "mistral", model: "fixture" },
    });
    expect((await scriptFor(authorized as any, generate)).provider).toBe(
      "mistral",
    );
    expect(generate.mock.calls[0][0].prompt).toContain(request.knowledge);
    generate.mockResolvedValueOnce({
      content: "No valid file or JSON",
      metadata: {},
    });
    await expect(scriptFor(authorized as any, generate)).rejects.toThrow(
      "MISTRAL_SCRIPT_NOT_JSON",
    );
  });
  it("restricts registered media to their parcel and detects changed bytes and missing rights", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "studio-catalog-"));
    dirs.push(dir);
    vi.stubEnv("PUBLISHER_STUDIO_CATALOG", path.join(dir, "assets.json"));
    const file = Buffer.from("registered fixture bytes");
    await writeFile(path.join(dir, "image.png"), file);
    const asset = {
      id: "another-image",
      parcelId: "another-parcel",
      file: "image.png",
      sha256: hash(file),
      rights: {
        license: "CC0-1.0",
        attribution: "Fixture creator",
        source: "https://example.org/fixture",
        scope: "commercial",
      },
    };
    await writeFile(
      path.join(dir, "assets.json"),
      JSON.stringify({ assets: [asset] }),
    );
    expect((await registeredAsset(asset.id, asset.parcelId)).sha256).toBe(
      hash(file),
    );
    await expect(registeredAsset(asset.id, "wrong")).rejects.toThrow(
      "PARCEL_MEDIA_NOT_REGISTERED",
    );
    await writeFile(path.join(dir, "image.png"), "modified");
    await expect(registeredAsset(asset.id, asset.parcelId)).rejects.toThrow(
      "MEDIA_HASH_MISMATCH",
    );
    await writeFile(
      path.join(dir, "assets.json"),
      JSON.stringify({ assets: [{ ...asset, rights: {} }] }),
    );
    await expect(registeredAsset(asset.id, asset.parcelId)).rejects.toThrow(
      "MEDIA_RIGHTS_REQUIRED",
    );
  });
  it("never retries a reserved failed operation or changes its content", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "studio-ledger-"));
    dirs.push(dir);
    vi.stubEnv("PUBLISHER_STUDIO_DIR", dir);
    const id = hash(
      JSON.stringify([input.parcelId, input.seedId, input.operationId]),
    );
    await mkdir(path.dirname(artifactPath(id, "report.json")), {
      recursive: true,
    });
    await writeFile(
      artifactPath(id, "report.json"),
      JSON.stringify({ status: "rendering", fingerprint: "other" }),
    );
    await expect(runStudio(input)).rejects.toThrow("STUDIO_OPERATION_CONFLICT");
    expect(() => artifactPath("../escape", "short.mp4")).toThrow();
    expect(() => artifactPath(id, "request.json")).toThrow();
  });
  it("rejects silent or non-finite audio evidence and keeps readable mobile captions", () => {
    expect(() => loudnessJson('{"input_i":"-inf","input_tp":"-inf"}')).toThrow(
      "AUDIO_SILENT_OR_INVALID",
    );
    expect(
      captionLines("Une phrase mobile qui tient sur plusieurs lignes.").every(
        (s) => s.length <= 28,
      ),
    ).toBe(true);
    expect(() => captionLines("x".repeat(29))).toThrow("CAPTION_WORD_TOO_LONG");
    const a = originalSoundtrack(0.5, [0.1]);
    expect(a.music.toString("ascii", 0, 4)).toBe("RIFF");
    expect(a.effects.length).toBe(48000 + 44);
    expect(a.music.equals(a.effects)).toBe(false);
  });
});
