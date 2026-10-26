import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, realpath, access } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
export function projectRoot() {
  let p = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(path.join(p, "pnpm-workspace.yaml"))) return p;
    p = path.dirname(p);
  }
  throw new StudioError("PUBLISHER_PROJECT_ROOT_REQUIRED");
}
const exec = promisify(execFile);
export class StudioError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export const hash = (v: string | Uint8Array) =>
  createHash("sha256").update(v).digest("hex");
export async function command(program: string, args: string[], cwd?: string) {
  try {
    return await exec(program, args, {
      cwd,
      timeout: 240000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, OMP_NUM_THREADS: "2" },
    });
  } catch {
    throw new StudioError(
      `${path
        .basename(program)
        .toUpperCase()
        .replace(/[^A-Z]/g, "")}_COMMAND_FAILED`,
    );
  }
}
export async function probe(file: string) {
  return JSON.parse(
    (
      await command("ffprobe", [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        file,
      ])
    ).stdout,
  ) as { streams: Record<string, any>[]; format: Record<string, any> };
}
export async function decode(file: string) {
  await command("ffmpeg", [
    "-v",
    "error",
    "-xerror",
    "-threads",
    "2",
    "-i",
    file,
    "-f",
    "null",
    "-",
  ]);
}
/** Check actual media properties against the request, never report claims. */
export async function verifyStudioMedia(
  file: string,
  capability: string,
  duration: number,
) {
  const p = await probe(file),
    v = p.streams?.find((s) => s.codec_type === "video"),
    a = p.streams?.find((s) => s.codec_type === "audio");
  const seconds = Number(p.format?.duration);
  if (capability === "image.studio") {
    if (!v || v.codec_name !== "png" || v.width !== 1080 || v.height !== 1920)
      throw new StudioError("STUDIO_MEDIA_FORMAT_INVALID");
  } else {
    if (
      !Number.isFinite(seconds) ||
      Math.abs(seconds - duration) > 0.1 ||
      !a ||
      Number(a.sample_rate) !== 48000 ||
      a.channels !== 2
    )
      throw new StudioError("STUDIO_MEDIA_FORMAT_INVALID");
    if (
      capability === "video.studio" &&
      (!v ||
        v.codec_name !== "h264" ||
        v.width !== 1080 ||
        v.height !== 1920 ||
        v.pix_fmt !== "yuv420p" ||
        v.r_frame_rate !== "30/1" ||
        a.codec_name !== "aac")
    )
      throw new StudioError("STUDIO_MEDIA_FORMAT_INVALID");
    if (capability === "audio.studio" && a.codec_name !== "pcm_s16le")
      throw new StudioError("STUDIO_MEDIA_FORMAT_INVALID");
  }
  return p;
}
export async function fontPath() {
  for (const p of [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
  ]) {
    try {
      await access(p);
      return p;
    } catch {
      /* Try another installed location. */
    }
  }
  throw new StudioError("FONT_UNAVAILABLE");
}
export interface Rights {
  license: string;
  attribution: string;
  source: string;
  scope: "local-preview" | "commercial";
}
export function rights(value: any): Rights {
  if (
    !value ||
    !["CC0-1.0", "CC-BY-4.0", "LicenseRef-Owner-Authorized-Preview"].includes(
      value.license,
    ) ||
    !["local-preview", "commercial"].includes(value.scope) ||
    !value.attribution?.trim() ||
    !value.source?.trim() ||
    (value.license === "LicenseRef-Owner-Authorized-Preview" &&
      value.scope !== "local-preview")
  )
    throw new StudioError("MEDIA_RIGHTS_REQUIRED");
  return value;
}
export interface Asset {
  id: string;
  parcelId: string;
  file: string;
  sha256: string;
  rights: Rights;
  crop?: { x: number; y: number; width: number; height: number };
}
export async function registeredAsset(id: string, parcelId: string) {
  const catalogPath = path.resolve(
    process.env.PUBLISHER_STUDIO_CATALOG ||
      path.join(projectRoot(), "data/studio-inputs/assets.json"),
  );
  const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as {
    assets: Asset[];
  };
  const a = catalog.assets.find((a) => a.id === id && a.parcelId === parcelId);
  if (!a) throw new StudioError("PARCEL_MEDIA_NOT_REGISTERED");
  rights(a.rights);
  const root = await realpath(path.dirname(catalogPath));
  const file = await realpath(path.resolve(root, a.file));
  if (!file.startsWith(root + path.sep))
    throw new StudioError("MEDIA_PATH_OUTSIDE_CATALOG");
  const bytes = await readFile(file);
  if (bytes.length > 30 * 1024 * 1024 || hash(bytes) !== a.sha256)
    throw new StudioError("MEDIA_HASH_MISMATCH");
  return { ...a, file, bytes: bytes.length };
}
export const rootPath = () =>
  path.resolve(
    process.env.PUBLISHER_STUDIO_DIR || path.join(projectRoot(), "data/studio"),
  );
const files = new Set([
  "short.mp4",
  "audio.wav",
  "image.png",
  "report.json",
  "captions.srt",
  "poster.jpg",
  "script.json",
  "voice.wav",
  "music.wav",
  "effects.wav",
]);
export function artifactPath(id: string, file: string) {
  if (!/^[a-f0-9]{64}$/.test(id) || !files.has(file))
    throw new StudioError("INVALID_ARTIFACT_PATH");
  return path.join(rootPath(), "jobs", id, file);
}
export async function studioCatalog() {
  const checks: Record<string, boolean> = {};
  for (const name of ["ffmpeg", "ffprobe"]) {
    try {
      await command(name, ["-version"]);
      checks[name] = true;
    } catch {
      checks[name] = false;
    }
  }
  try {
    await fontPath();
    checks.font = true;
  } catch {
    checks.font = false;
  }
  try {
    if (!process.env.PIPER_MODEL) throw new Error();
    await access(process.env.PIPER_MODEL);
    await access(process.env.PIPER_MODEL + ".json");
    await command(process.env.PIPER_BIN || "piper", ["--help"]);
    checks.piper = true;
  } catch {
    checks.piper = false;
  }
  return {
    contract: "publisher-studio-v1",
    checks,
    runtimeReady: Object.values(checks).every(Boolean),
    capabilities: ["image.studio", "audio.studio", "video.studio"],
    format: { width: 1080, height: 1920, fps: 30 },
    publicationEnabled: false,
    automaticProviderFallback: false,
    providers: {
      images: "registered-media or explicitly authorized existing Mistral",
      text: "approved parcel script or explicitly authorized existing Mistral",
      voice: "local French Piper",
      music: "original procedural CC0",
    },
    note: "Configured credentials, discovered tools and verified output files are distinct states.",
  };
}
