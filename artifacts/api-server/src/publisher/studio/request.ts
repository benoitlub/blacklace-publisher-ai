import { StudioError } from "./runtime";
export interface Segment {
  text: string;
  caption: string;
}
export interface StudioRequest {
  version: "studio-v1";
  parcelId: string;
  seedId: string;
  operationId: string;
  durationSeconds: number;
  assetId?: string;
  videoAssetId?: string;
  imagePrompt?: string;
  title: string;
  segments?: Segment[];
  knowledge?: string;
  creativeFeedback?: { feedbackId: string; creativeGuidance: string[]; prohibitedActions: string[] }[];
  scriptRights?: { source: string; attribution: string };
  authorizedResources: string[];
  automaticPublication: false;
}
const text = (v: unknown, n = 200) =>
  typeof v === "string" &&
  v.trim().length > 0 &&
  v.length <= n &&
  !/[\x00-\x08\x0b-\x1f\x7f]/.test(v);
export function validateRequest(v: any): StudioRequest {
  const allowed = [
    "version",
    "parcelId",
    "seedId",
    "operationId",
    "durationSeconds",
    "assetId",
    "videoAssetId",
    "imagePrompt",
    "title",
    "segments",
    "knowledge",
    "creativeFeedback",
    "scriptRights",
    "authorizedResources",
    "automaticPublication",
  ];
  if (
    !v ||
    typeof v !== "object" ||
    Object.keys(v).some((k) => !allowed.includes(k)) ||
    v.version !== "studio-v1" ||
    v.automaticPublication !== false ||
    !["parcelId", "seedId", "operationId", "title"].every((k) =>
      text(v[k], 150),
    ) ||
    !Array.isArray(v.authorizedResources) ||
    !v.authorizedResources.every((x: unknown) => typeof x === "string") ||
    !Number.isFinite(v.durationSeconds) ||
    v.durationSeconds < 8 ||
    v.durationSeconds > 60 ||
    (v.assetId !== undefined && !text(v.assetId, 100)) ||
    (v.videoAssetId !== undefined && !text(v.videoAssetId, 100)) ||
    (v.videoAssetId !== undefined && v.assetId !== undefined) ||
    (v.videoAssetId !== undefined && v.imagePrompt !== undefined) ||
    (v.imagePrompt !== undefined && !text(v.imagePrompt, 2000)) ||
    (v.knowledge !== undefined && !text(v.knowledge, 15000)) ||
    (v.creativeFeedback !== undefined && (
      !Array.isArray(v.creativeFeedback) || v.creativeFeedback.length > 8 ||
      v.creativeFeedback.some((f: any) => !f || typeof f !== 'object' ||
        Object.keys(f).some((k) => !['feedbackId','creativeGuidance','prohibitedActions'].includes(k)) ||
        !text(f.feedbackId, 120) || !Array.isArray(f.creativeGuidance) ||
        f.creativeGuidance.length < 1 || f.creativeGuidance.length > 8 ||
        !f.creativeGuidance.every((s: unknown) => text(s, 240)) ||
        !Array.isArray(f.prohibitedActions) || f.prohibitedActions.length > 8 ||
        !f.prohibitedActions.every((s: unknown) => text(s, 180)))
    ))
  )
    throw new StudioError("INVALID_STUDIO_REQUEST");
  if (
    !["parcelId", "seedId", "operationId"].every((k) =>
      /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,149}$/.test(v[k]),
    ) ||
    /[\r\n]/.test(v.title)
  )
    throw new StudioError("INVALID_STUDIO_IDENTITY");
  if (v.segments !== undefined) {
    validateSegments(v.segments);
    if (
      !text(v.scriptRights?.source, 1000) ||
      !text(v.scriptRights?.attribution, 500)
    )
      throw new StudioError("SCRIPT_PROVENANCE_REQUIRED");
  }
  return v;
}
export function validateSegments(v: any): asserts v is Segment[] {
  if (
    !Array.isArray(v) ||
    v.length < 1 ||
    v.length > 12 ||
    v.some(
      (s) =>
        !text(s?.text, 180) ||
        !text(s?.caption, 84) ||
        /[{}<>\\\r\n]/.test(s.caption),
    )
  )
    throw new StudioError("INVALID_NARRATION_SEGMENTS");
}
export function requirePermission(r: StudioRequest, capability: string) {
  if (!r.authorizedResources.includes(capability))
    throw new StudioError("STUDIO_AUTHORIZATION_REQUIRED");
}
