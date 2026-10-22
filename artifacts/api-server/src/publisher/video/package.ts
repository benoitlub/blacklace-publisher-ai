import { videoReferences, type ReferenceId } from "./catalog";
export type VideoPackage = {
  version: "video-package-v1";
  decisionOwner: "gerard";
  authoredBy: "gerard" | "user-demo";
  characterId: string;
  referenceId: ReferenceId;
  scene: string;
  action: string;
  mood: string;
  durationSeconds: number;
  sourceStartSeconds: number;
  loopSource: boolean;
  format: "9:16";
  mode: "existing-media";
  voice: "none";
  maxExternalCost: 0;
  automaticPublication: false;
  destination: {
    project: string;
    platform: "instagram" | "youtube" | "local-preview";
    account: string;
  };
  storyboard: { start: number; end: number; text: string }[];
  learningFrom?: {
    artifactId: string;
    defects: string[];
    improvements: string[];
  };
};
export class VideoError extends Error {
  constructor(
    public readonly code: string,
    public readonly details: string[] = [],
  ) {
    super(code);
  }
}
export function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
const text = (v: unknown, max = 500): v is string =>
  typeof v === "string" &&
  v.trim().length > 0 &&
  v.length <= max &&
  !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(v);
export function prepareVideoPackage(value: unknown): VideoPackage {
  const v = object(value),
    errors: string[] = [];
  const allowed = new Set([
    "version",
    "decisionOwner",
    "authoredBy",
    "characterId",
    "referenceId",
    "scene",
    "action",
    "mood",
    "durationSeconds",
    "sourceStartSeconds",
    "loopSource",
    "format",
    "mode",
    "voice",
    "maxExternalCost",
    "automaticPublication",
    "destination",
    "storyboard",
    "learningFrom",
  ]);
  if (Object.keys(v).some((k) => !allowed.has(k)))
    errors.push(
      "Unknown field; URLs, paths, provider substitutions and render commands are not accepted.",
    );
  if (
    v.version !== "video-package-v1" ||
    v.decisionOwner !== "gerard" ||
    !["gerard", "user-demo"].includes(String(v.authoredBy))
  )
    errors.push("Explicit creative ownership and package version required.");
  if (
    v.mode !== "existing-media" ||
    v.voice !== "none" ||
    v.maxExternalCost !== 0 ||
    v.automaticPublication !== false ||
    v.format !== "9:16"
  )
    errors.push(
      "Only existing-media, silent, zero external cost, 9:16, unpublished output is supported.",
    );
  const ref = Object.hasOwn(videoReferences, String(v.referenceId))
    ? videoReferences[v.referenceId as ReferenceId]
    : null;
  if (!ref || v.characterId !== ref.characterId)
    errors.push(
      "A verified reference of the selected character is required; Aloisia has no verified visual reference.",
    );
  for (const key of ["scene", "action", "mood"])
    if (!text(v[key])) errors.push(`${key} is required (1–500 characters).`);
  if (
    typeof v.durationSeconds !== "number" ||
    !Number.isFinite(v.durationSeconds) ||
    v.durationSeconds < 8 ||
    v.durationSeconds > 15
  )
    errors.push("durationSeconds must be 8–15.");
  if (
    typeof v.sourceStartSeconds !== "number" ||
    !Number.isFinite(v.sourceStartSeconds) ||
    v.sourceStartSeconds < 0 ||
    v.sourceStartSeconds > 3600 ||
    typeof v.loopSource !== "boolean"
  )
    errors.push("Explicit source start and loop choice required.");
  const destination = object(v.destination);
  if (
    !text(destination.project, 100) ||
    !text(destination.account, 100) ||
    !["instagram", "youtube", "local-preview"].includes(
      String(destination.platform),
    ) ||
    Object.keys(destination).some(
      (k) => !["project", "platform", "account"].includes(k),
    )
  )
    errors.push(
      "Explicit project, account and supported destination required; no delivery is performed.",
    );
  const shots = Array.isArray(v.storyboard) ? v.storyboard : [];
  let end = 0;
  if (shots.length < 1 || shots.length > 5)
    errors.push("1–5 explicit caption intervals required.");
  for (const shot of shots) {
    const s = object(shot);
    if (
      Object.keys(s).some((k) => !["start", "end", "text"].includes(k)) ||
      typeof s.start !== "number" ||
      typeof s.end !== "number" ||
      !Number.isFinite(s.start) ||
      !Number.isFinite(s.end) ||
      s.start !== end ||
      s.end <= s.start ||
      s.end - s.start < 1.5 ||
      s.end > Number(v.durationSeconds)
    )
      errors.push(
        "Storyboard intervals must cover the timeline continuously and last at least 1.5 seconds.",
      );
    if (
      !text(s.text, 70) ||
      String(s.text).split("\n").length > 2 ||
      String(s.text)
        .split("\n")
        .some((line) => [...line].length > 24)
    )
      errors.push("Mobile captions: at most 2 lines of 24 characters.");
    end = Number(s.end);
  }
  if (end !== v.durationSeconds)
    errors.push("Storyboard must cover the full requested duration.");
  if (v.learningFrom !== undefined) {
    const l = object(v.learningFrom);
    if (
      !/^[a-f0-9]{64}$/.test(String(l.artifactId)) ||
      !Array.isArray(l.defects) ||
      !Array.isArray(l.improvements) ||
      !l.defects.length ||
      !l.improvements.length ||
      [...l.defects, ...l.improvements].some((x) => !text(x, 300))
    )
      errors.push(
        "Learning requires a previous artifact ID, observed defects and Gerard's explicit improvements.",
      );
  }
  if (errors.length) throw new VideoError("INVALID_VIDEO_PACKAGE", errors);
  // Validation never writes the story, changes the character, picks a new
  // destination or calls an intelligent provider on Gerard's behalf.
  return structuredClone(v) as VideoPackage;
}
