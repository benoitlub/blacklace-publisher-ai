import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { videoReferences, characters, videoTools } from "./catalog";
import {
  prepareVideoPackage,
  VideoError,
  object,
  type VideoPackage,
} from "./package";

const run = promisify(execFile);
const profile = "publisher-existing-video-v2";
const hash = (bytes: string | Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value);
}
export const videoRoot = () =>
  path.resolve(process.env.PUBLISHER_VIDEO_DIR || "data/video");
export function artifactPath(id: string, file: string, root = videoRoot()) {
  if (
    !/^[a-f0-9]{64}$/.test(id) ||
    !["video.mp4", "report.json", "poster.jpg"].includes(file)
  )
    throw new VideoError("INVALID_ARTIFACT_PATH");
  return path.join(root, "jobs", id, file);
}
async function command(program: string, args: string[], cwd?: string) {
  try {
    return await run(program, args, {
      cwd,
      timeout: 120000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
  } catch {
    throw new VideoError(
      program === "ffprobe"
        ? "VIDEO_PROBE_FAILED"
        : "VIDEO_RENDER_COMMAND_FAILED",
    );
  }
}
async function fontPath() {
  for (const file of [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
  ]) {
    try {
      await access(file);
      return file;
    } catch {
      /* Try another installed font. */
    }
  }
  throw new VideoError("VIDEO_FONT_UNAVAILABLE");
}
export async function videoCatalog() {
  let runtimeReady = false;
  try {
    await command("ffmpeg", ["-version"]);
    await command("ffprobe", ["-version"]);
    await fontPath();
    const encoders = await command("ffmpeg", ["-hide_banner", "-encoders"]),
      filters = await command("ffmpeg", ["-hide_banner", "-filters"]);
    runtimeReady =
      /\blibx264\b/.test(encoders.stdout) &&
      /\baac\b/.test(encoders.stdout) &&
      ["drawtext", "scale", "pad"].every((name) =>
        new RegExp(`\\b${name}\\b`).test(filters.stdout),
      );
  } catch {
    /* No fallback to a paid tool. */
  }
  return {
    contract: "publisher-video-catalog-v1",
    auditDate: "2026-10-22",
    runtimeReady,
    characters,
    references: videoReferences,
    tools: videoTools,
    mode: "existing-media-only",
    externalGenerationEnabled: false,
    publicationEnabled: false,
    limitations: [
      "No verified visual reference for Aloisia.",
      "Scene, mood and requested action are creative instructions; semantic compliance is reviewed, not inferred by FFmpeg.",
      "Marty source lasts about 5 seconds: an 8–15 second montage requires Gerard's explicit loop choice.",
      "Connected session accounts do not prove Publisher runtime access or available credits.",
    ],
  };
}
async function sourceFile(request: VideoPackage, root: string) {
  const ref = videoReferences[request.referenceId];
  const filename = path.join(
    root,
    "sources",
    ref.sha256 + path.extname(ref.file),
  );
  let bytes: Buffer;
  try {
    bytes = await readFile(filename);
  } catch {
    await mkdir(path.dirname(filename), { recursive: true });
    let response: Response;
    try {
      response = await fetch(ref.url, {
        redirect: "error",
        signal: AbortSignal.timeout(45000),
      });
    } catch {
      throw new VideoError("REFERENCE_DOWNLOAD_UNAVAILABLE");
    }
    if (!response.ok || !response.body)
      throw new VideoError("REFERENCE_DOWNLOAD_UNAVAILABLE");
    const parts: Uint8Array[] = [];
    let size = 0;
    for await (const part of response.body) {
      size += part.length;
      if (size > ref.bytes) {
        await response.body.cancel().catch(() => {});
        throw new VideoError("REFERENCE_SIZE_MISMATCH");
      }
      parts.push(part);
    }
    bytes = Buffer.concat(parts);
    if (bytes.length !== ref.bytes || hash(bytes) !== ref.sha256)
      throw new VideoError("REFERENCE_HASH_MISMATCH");
    try {
      await writeFile(filename, bytes, { flag: "wx" });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
  }
  if (bytes.length !== ref.bytes || hash(bytes) !== ref.sha256)
    throw new VideoError("REFERENCE_HASH_MISMATCH");
  return filename;
}
async function probe(file: string) {
  const result = await command("ffprobe", [
    "-v",
    "error",
    "-show_format",
    "-show_streams",
    "-of",
    "json",
    file,
  ]);
  return JSON.parse(result.stdout) as {
    streams: Record<string, any>[];
    format: Record<string, any>;
  };
}
async function readReport(id: string, root: string) {
  try {
    return JSON.parse(
      await readFile(artifactPath(id, "report.json", root), "utf8"),
    ) as Record<string, any>;
  } catch {
    return null;
  }
}
let rendering = false;
export async function renderVideo(
  value: unknown,
  root = videoRoot(),
): Promise<Record<string, any>> {
  const request = prepareVideoPackage(value);
  const ref = videoReferences[request.referenceId];
  const id = hash(canonical({ profile, request, referenceHash: ref.sha256 }));
  const links = {
    downloadUrl: `/api/production/video/artifacts/${id}/video.mp4`,
    reportUrl: `/api/production/video/artifacts/${id}/report.json`,
    posterUrl: `/api/production/video/artifacts/${id}/poster.jpg`,
  };
  const previous = await readReport(id, root);
  if (previous) {
    if (previous.status !== "ready-for-review")
      return { ...previous, reused: true };
    try {
      if (
        hash(await readFile(artifactPath(id, "video.mp4", root))) !==
        previous.artifact.sha256
      )
        throw new Error();
    } catch {
      throw new VideoError("VIDEO_ARTIFACT_MISSING_OR_CHANGED");
    }
    return { ...previous, reused: true };
  }
  if (rendering) throw new VideoError("VIDEO_RENDER_BUSY");
  rendering = true;
  try {
    const dependencies = await videoCatalog();
    if (!dependencies.runtimeReady)
      throw new VideoError("VIDEO_RUNTIME_UNAVAILABLE");
    if (
      request.learningFrom &&
      !(await readReport(request.learningFrom.artifactId, root))
    )
      throw new VideoError("LEARNING_ARTIFACT_NOT_FOUND");
    const directory = path.join(root, "jobs", id);
    await mkdir(path.dirname(directory), { recursive: true });
    // Cross-process claim. A stale directory is reported, never silently retried.
    try {
      await mkdir(directory);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST")
        throw new VideoError("VIDEO_RENDER_IN_PROGRESS_OR_INTERRUPTED");
      throw e;
    }
    const began = Date.now();
    let stage = "source";
    try {
      const source = await sourceFile(request, root);
      const sourceProbe = await probe(source);
      const sourceDuration = Number(sourceProbe.format.duration);
      const sourceVideo = sourceProbe.streams.find(
        (s) => s.codec_type === "video",
      );
      if (
        !sourceVideo ||
        !Number.isFinite(sourceDuration) ||
        request.sourceStartSeconds >= sourceDuration ||
        (!request.loopSource &&
          request.sourceStartSeconds + request.durationSeconds >
            sourceDuration + 0.02)
      )
        throw new VideoError("SOURCE_TOO_SHORT_FOR_REQUEST");
      stage = "storyboard";
      await copyFile(await fontPath(), path.join(directory, "font.ttf"));
      await writeFile(path.join(directory, "brand.txt"), "BLACKLACE ISLAND");
      await writeFile(
        path.join(directory, "character.txt"),
        ref.name.toUpperCase(),
      );
      await writeFile(
        path.join(directory, "kicker.txt"),
        "ARCHIVES / PRO.HIBITED NETWORK",
      );
      await writeFile(
        path.join(directory, "footer.txt"),
        "PROTOTYPE / NON PUBLIÉ",
      );
      for (let i = 0; i < request.storyboard.length; i++) {
        await writeFile(
          path.join(directory, `caption-${i}.txt`),
          request.storyboard[i].text,
        );
        // Measure actual glyphs, not character count, before claiming mobile QC.
        const measure = await command(
          "ffmpeg",
          [
            "-v",
            "debug",
            "-nostdin",
            "-f",
            "lavfi",
            "-i",
            "color=s=1080x1920:r=1:d=1",
            "-vf",
            `drawtext=fontfile=font.ttf:textfile=caption-${i}.txt:expansion=none:fontsize=64`,
            "-frames:v",
            "1",
            "-f",
            "null",
            "-",
          ],
          directory,
        );
        const width = [...measure.stderr.matchAll(/text_w:\s*(\d+)/g)].map(
          (m) => Number(m[1]),
        );
        width.push(
          ...[...measure.stderr.matchAll(/width64:\s*(\d+)/g)].map(
            (m) => Number(m[1]) / 64,
          ),
        );
        if (!width.length || Math.max(...width) > 920)
          throw new VideoError("CAPTION_EXCEEDS_MOBILE_SAFE_AREA", [
            `caption ${i + 1}`,
          ]);
      }
      stage = "render";
      const draw = (file: string, size: number, y: number, color = "white") =>
        `drawtext=fontfile=font.ttf:textfile=${file}:expansion=none:fontcolor=${color}:fontsize=${size}:x=80:y=${y}`;
      const captions = request.storyboard.map(
        (s, i) =>
          `drawtext=fontfile=font.ttf:textfile=caption-${i}.txt:expansion=none:fontcolor=white:fontsize=64:line_spacing=18:x=(w-text_w)/2:y=1330:enable='gte(t,${s.start})*lt(t,${s.end})'`,
      );
      const filters = [
        "scale=1080:780:force_original_aspect_ratio=decrease",
        "pad=1080:780:(ow-iw)/2:(oh-ih)/2:color=0x0b0c16",
        "setsar=1",
        "pad=1080:1920:0:420:color=0x0b0c16",
        "drawbox=x=80:y=340:w=110:h=5:color=0xc0392b:t=fill",
        draw("brand.txt", 28, 140, "0xd5d1dc"),
        draw("character.txt", 90, 220),
        draw("kicker.txt", 24, 380, "0xd5d1dc"),
        ...captions,
        draw("footer.txt", 24, 1680, "0xd5d1dc"),
      ].join(",");
      await command(
        "ffmpeg",
        [
          "-y",
          "-v",
          "error",
          "-nostdin",
          ...(request.loopSource ? ["-stream_loop", "-1"] : []),
          "-ss",
          String(request.sourceStartSeconds),
          "-i",
          source,
          "-f",
          "lavfi",
          "-i",
          "anullsrc=r=48000:cl=stereo",
          "-t",
          String(request.durationSeconds),
          "-map",
          "0:v:0",
          "-map",
          "1:a:0",
          "-vf",
          filters,
          "-r",
          "30",
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "23",
          "-pix_fmt",
          "yuv420p",
          "-threads",
          "2",
          "-filter_threads",
          "1",
          "-c:a",
          "aac",
          "-b:a",
          "96k",
          "-movflags",
          "+faststart",
          "video.mp4",
        ],
        directory,
      );
      stage = "quality-control";
      const video = path.join(directory, "video.mp4");
      const media = await probe(video);
      const stream = media.streams.find((s) => s.codec_type === "video");
      const audio = media.streams.find((s) => s.codec_type === "audio");
      const bytes = await readFile(video);
      const checks = {
        dimension: stream?.width === 1080 && stream?.height === 1920,
        codec: stream?.codec_name === "h264",
        pixelFormat: stream?.pix_fmt === "yuv420p",
        frameRate: stream?.r_frame_rate === "30/1",
        duration:
          Math.abs(Number(media.format.duration) - request.durationSeconds) <
          0.1,
        audio: audio?.codec_name === "aac",
        fastStart:
          bytes.indexOf("moov") >= 0 &&
          bytes.indexOf("moov") < bytes.indexOf("mdat"),
        referenceHash: true,
        mobileCaptionBounds: true,
        fullReferenceFramePreserved: true,
      };
      if (Object.values(checks).some((v) => !v))
        throw new VideoError("VIDEO_TECHNICAL_QC_FAILED");
      await command(
        "ffmpeg",
        ["-v", "error", "-nostdin", "-i", video, "-f", "null", "-"],
        directory,
      );
      await command(
        "ffmpeg",
        [
          "-y",
          "-v",
          "error",
          "-ss",
          "1",
          "-i",
          video,
          "-vf",
          "scale=540:960",
          "-frames:v",
          "1",
          "poster.jpg",
        ],
        directory,
      );
      const report = {
        contract: "publisher-video-result-v1",
        status: "ready-for-review",
        artifactId: id,
        profile,
        request,
        artifact: {
          id,
          mimeType: "video/mp4",
          ...links,
          sha256: hash(bytes),
          bytes: bytes.length,
          width: 1080,
          height: 1920,
          durationSeconds: Number(media.format.duration),
        },
        source: {
          referenceId: request.referenceId,
          url: ref.url,
          sha256: ref.sha256,
          gitBlob: ref.gitBlob,
          attribution: ref.attribution,
          rights: ref.rights,
          durationSeconds: sourceDuration,
        },
        cost: {
          externalProviderCharge: 0,
          currency: "EUR",
          paidToolsInvoked: false,
          historicalSourceCost: "unknown-not-charged-by-this-job",
          infrastructureCost: null,
        },
        quality: {
          technicalPassed: true,
          checks,
          decodePassed: true,
          identity: "existing-footage-preserved-human-review-pending",
          semanticAction: "not-automatically-verified",
          humanApproval: "pending",
        },
        warnings: [
          "Silent montage: no source speech, cloned voice or generated voice.",
          "Scene, action and mood are retained as instructions, not synthesized. Review their match against the existing footage.",
          ...(request.loopSource
            ? [
                "Source repetition explicitly requested; inspect visible loop seams.",
              ]
            : []),
        ],
        errors: [],
        publication: {
          enabled: false,
          performed: false,
          destination: request.destination,
        },
        createdAt: new Date().toISOString(),
        renderMilliseconds: Date.now() - began,
      };
      await writeFile(
        path.join(directory, "report.json"),
        JSON.stringify(report, null, 2) + "\n",
        { flag: "wx" },
      );
      return { ...report, reused: false };
    } catch (error) {
      const report = {
        contract: "publisher-video-result-v1",
        status: "failed",
        artifactId: id,
        request,
        stage,
        errors: [
          {
            code:
              error instanceof VideoError ? error.code : "LOCAL_VIDEO_FAILURE",
            details: error instanceof VideoError ? error.details : [],
          },
        ],
        cost: {
          externalProviderCharge: 0,
          currency: "EUR",
          paidToolsInvoked: false,
        },
        publication: { enabled: false, performed: false },
      };
      await writeFile(
        path.join(directory, "report.json"),
        JSON.stringify(report, null, 2) + "\n",
        { flag: "wx" },
      );
      return report;
    }
  } finally {
    rendering = false;
  }
}

export async function reviewVideo(value: unknown, root = videoRoot()) {
  const v = object(value),
    id = String(v.artifactId ?? ""),
    reviewer = String(v.reviewer ?? "");
  if (
    !/^[a-f0-9]{64}$/.test(id) ||
    !["gerard", "human"].includes(reviewer) ||
    !Array.isArray(v.comparisons) ||
    v.comparisons.length < 1 ||
    v.comparisons.length > 12
  )
    throw new VideoError("INVALID_VIDEO_REVIEW");
  const previous = await readReport(id, root);
  if (previous?.status !== "ready-for-review")
    throw new VideoError("REVIEW_ARTIFACT_NOT_READY");
  for (const item of v.comparisons) {
    const c = object(item);
    if (
      ![
        "identity",
        "action",
        "readability",
        "sound",
        "destination",
        "pacing",
      ].includes(String(c.criterion)) ||
      !["pass", "defect"].includes(String(c.result)) ||
      typeof c.expected !== "string" ||
      !c.expected.trim() ||
      c.expected.length > 300 ||
      typeof c.observed !== "string" ||
      !c.observed.trim() ||
      c.observed.length > 300
    )
      throw new VideoError("INVALID_VIDEO_REVIEW");
  }
  const changes = object(v.nextChanges);
  if (
    !Object.keys(changes).length ||
    Object.keys(changes).some(
      (k) =>
        ![
          "scene",
          "action",
          "mood",
          "storyboard",
          "referenceId",
          "sourceStartSeconds",
          "durationSeconds",
          "loopSource",
        ].includes(k),
    )
  )
    throw new VideoError("INVALID_VIDEO_REVIEW_CHANGES");
  const defects = v.comparisons
    .filter((c) => object(c).result === "defect")
    .map((c) => `${object(c).criterion}: ${object(c).observed}`);
  if (!defects.length) throw new VideoError("LEARNING_DEFECT_REQUIRED");
  const improvements = Object.keys(changes).map(
    (k) =>
      `${reviewer === "gerard" ? "Gérard" : "Relecteur humain"} ajuste ${k}.`,
  );
  const nextPackage = prepareVideoPackage({
    ...previous.request,
    ...changes,
    authoredBy: reviewer === "gerard" ? "gerard" : "user-demo",
    learningFrom: { artifactId: id, defects, improvements },
  });
  const record = {
    contract: "publisher-video-review-v1",
    artifactId: id,
    reviewer,
    comparisons: v.comparisons,
    nextPackage,
    automaticRender: false,
    automaticPublication: false,
  };
  const reviewId = hash(canonical(record));
  try {
    await writeFile(
      path.join(root, "jobs", id, `review-${reviewId}.json`),
      JSON.stringify(record, null, 2) + "\n",
      { flag: "wx" },
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  }
  return { ...record, reviewId };
}
