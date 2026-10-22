import { describe, it, expect, vi, afterEach } from "vitest";
import {
  readFile,
  mkdtemp,
  mkdir,
  writeFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prepareVideoPackage, VideoError } from "./package";
import { executeVideoMission } from "./adapter";
import { artifactPath, reviewVideo } from "./render";
const example = async () =>
  JSON.parse(
    await readFile(
      new URL(
        "../../../../../docs/prototypes/natasha/request.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
afterEach(() => vi.restoreAllMocks());
describe("Gerard video package", () => {
  it("retains the exact creative decisions instead of writing a new story", async () => {
    const request = await example();
    expect(prepareVideoPackage(request)).toEqual(request);
    const out = await executeVideoMission({
      operationId: "preview",
      requiredCapabilities: ["video.prepare"],
      authorizedResources: [],
      context: { metadata: { videoPackage: request } },
    });
    expect(out.status).toBe("completed");
    expect(out.output).toMatchObject({
      status: "prepared",
      videoPackage: request,
      publishingEnabled: false,
    });
  });
  it("rejects paid providers, voices, arbitrary assets, substituted identities and publication", async () => {
    const request = await example(),
      network = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("No outbound calls"));
    for (const change of [
      { maxExternalCost: 1 },
      { voice: "cloned-natasha" },
      { mode: "kling" },
      { automaticPublication: true },
      { referenceId: "https://evil.test/a.mp4" },
      { characterId: "marty" },
      { characterId: "aloisia", referenceId: "aloisia" },
      { command: "ffmpeg" },
      { mediaUrl: "http://localhost/private" },
      { durationSeconds: 60 },
    ])
      expect(() => prepareVideoPackage({ ...request, ...change })).toThrow(
        VideoError,
      );
    expect(network).not.toHaveBeenCalled();
  });
  it("blocks unreadable and discontinuous captions before rendering", async () => {
    const request = await example();
    for (const storyboard of [
      [{ start: 0, end: 10, text: "X".repeat(25) }],
      [{ start: 1, end: 10, text: "Trou" }],
      [{ start: 0, end: 3, text: "Couvert" }],
      [{ start: 0, end: 10, text: "A\nB\nC" }],
      [{ start: 0, end: 10, text: "Text\u0000" }],
    ])
      expect(() => prepareVideoPackage({ ...request, storyboard })).toThrow(
        VideoError,
      );
  });
  it("requires explicit render authorization and isolates video from other capabilities", async () => {
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("No outbound calls"));
    for (const mission of [
      { requiredCapabilities: ["video.render"], authorizedResources: [] },
      {
        requiredCapabilities: ["video.render", "social.publish"],
        authorizedResources: ["video.render", "social.publish"],
      },
    ]) {
      const out = await executeVideoMission({
        operationId: "not-authorized",
        ...mission,
        context: { metadata: { videoPackage: await example() } },
      });
      expect(out.status).toBe("needs-input");
    }
    expect(network).not.toHaveBeenCalled();
  });
  it("rejects file traversal and non-artifact files", () => {
    for (const [id, file] of [
      ["../private", "report.json"],
      ["a".repeat(64), "font.ttf"],
      ["a".repeat(64), "../../secrets"],
    ])
      expect(() => artifactPath(id, file)).toThrow(VideoError);
  });
  it("records comparison and prepares an explicit next request without rendering", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "publisher-video-review-")),
      id = "a".repeat(64),
      directory = path.join(root, "jobs", id),
      request = await example();
    try {
      await mkdir(directory, { recursive: true });
      await writeFile(
        path.join(directory, "report.json"),
        JSON.stringify({ status: "ready-for-review", request }),
      );
      const review = {
        artifactId: id,
        reviewer: "gerard",
        comparisons: [
          {
            criterion: "pacing",
            result: "defect",
            expected: "Dernière accroche plus longue",
            observed: "Trois secondes trop courtes pour le lecteur visé",
          },
        ],
        nextChanges: {
          storyboard: [
            { start: 0, end: 3, text: "LE SIGNAL PASSE." },
            { start: 3, end: 6, text: "NATASHA\nDEPUIS BLACKLACE." },
            { start: 6, end: 10, text: "EXPLOREZ\nBLACKLACE ISLAND." },
          ],
        },
      };
      const out = await reviewVideo(review, root);
      const again = await reviewVideo(review, root);
      expect(out.reviewId).toBe(again.reviewId);
      expect(out.automaticRender).toBe(false);
      expect(out.nextPackage).toMatchObject({
        authoredBy: "gerard",
        storyboard: review.nextChanges.storyboard,
        learningFrom: { artifactId: id },
      });
      expect(await readdir(directory)).toHaveLength(2);
      await expect(
        reviewVideo({ ...review, nextChanges: { maxExternalCost: 1 } }, root),
      ).rejects.toThrow("INVALID_VIDEO_REVIEW_CHANGES");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
