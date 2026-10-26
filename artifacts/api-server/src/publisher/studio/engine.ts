import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { validateRequest, requirePermission } from "./request";
import {
  rootPath,
  artifactPath,
  hash,
  StudioError,
  studioCatalog,
} from "./runtime";
import { produceAudio } from "./audio";
import { produceImage } from "./image";
import { produceVideo, prepareGameplaySource } from "./video";
export const STUDIO_CAPABILITIES = [
  "image.studio",
  "audio.studio",
  "video.studio",
] as const;
export async function runStudio(
  value: unknown,
  capability: string = "video.studio",
) {
  const request = validateRequest(value);
  if (!STUDIO_CAPABILITIES.includes(capability as any))
    throw new StudioError("UNKNOWN_STUDIO_CAPABILITY");
  requirePermission(request, capability);
  if (request.title.length > 26) throw new StudioError("MOBILE_TITLE_TOO_LONG");
  const fingerprint = hash(
    JSON.stringify({ profile: "studio-v1", capability, request }),
  );
  const id = hash(
    JSON.stringify([request.parcelId, request.seedId, request.operationId]),
  );
  const dir = path.join(rootPath(), "jobs", id);
  try {
    const old = JSON.parse(
      await readFile(artifactPath(id, "report.json"), "utf8"),
    );
    if (old.fingerprint !== fingerprint)
      throw new StudioError("STUDIO_OPERATION_CONFLICT");
    if (old.status === "ready-for-review") {
      for (const file of old.files) {
        const bytes = await readFile(path.join(dir, file.filename));
        if (hash(bytes) !== file.sha256)
          throw new StudioError("STUDIO_ARTIFACT_MISSING_OR_CHANGED");
      }
    }
    return { ...old, reused: true };
  } catch (e: any) {
    if (e.code !== "ENOENT") throw e;
  }
  await mkdir(path.dirname(dir), { recursive: true });
  try {
    await mkdir(dir);
  } catch {
    throw new StudioError("STUDIO_OPERATION_ALREADY_CLAIMED");
  }
  const base = {
    contract: "publisher-studio-v1",
    id,
    fingerprint,
    capability,
    parcelId: request.parcelId,
    seedId: request.seedId,
    operationId: request.operationId,
    createdAt: new Date().toISOString(),
    published: false,
    publicationEnabled: false,
    creativeFeedback: request.creativeFeedback ?? [],
    creativeDirectionStatus: request.creativeFeedback?.length
      ? "received-for-review-not-proof-of-visual-compliance" : "no-owner-feedback",
    decisionOwner: "gerard",
    files: [] as Record<string, any>[],
    reportUrl: `/api/production/studio/artifacts/${id}/report.json`,
  };
  await writeFile(
    artifactPath(id, "report.json"),
    JSON.stringify({ ...base, status: "rendering" }),
  );
  try {
    const dependencies = await studioCatalog();
    if (
      !dependencies.checks.ffmpeg ||
      !dependencies.checks.ffprobe ||
      (capability !== "image.studio" && !dependencies.checks.piper) ||
      (capability === "video.studio" && !dependencies.checks.font)
    )
      throw new StudioError("STUDIO_RUNTIME_UNAVAILABLE");
    await writeFile(
      path.join(dir, "request.json"),
      JSON.stringify(request, null, 2) + "\n",
    );
    const image =
      capability === "video.studio" && request.videoAssetId
        ? await prepareGameplaySource(request, dir)
        : capability !== "audio.studio" ? await produceImage(request, dir) : null;
    const audio =
      capability !== "image.studio" ? await produceAudio(request, dir) : null;
    const video =
      capability === "video.studio"
        ? await produceVideo(request, dir, audio!)
        : null;
    const files = [];
    for (const filename of (await readdir(dir)).filter(
      (s) => s !== "report.json",
    )) {
      const bytes = await readFile(path.join(dir, filename));
      files.push({ filename, bytes: bytes.length, sha256: hash(bytes) });
    }
    const filename =
      capability === "video.studio"
        ? "short.mp4"
        : capability === "audio.studio"
          ? "audio.wav"
          : "image.png";
    const artifact = {
      ...files.find((f) => f.filename === filename),
      mimeType:
        capability === "video.studio"
          ? "video/mp4"
          : capability === "audio.studio"
            ? "audio/wav"
            : "image/png",
      downloadUrl: `/api/production/studio/artifacts/${id}/${filename}`,
    };
    const report = {
      ...base,
      status: "ready-for-review",
      image,
      audio,
      video,
      files,
      artifact,
      cost: {
        externalProviderCalls:
          image?.provider === "mistral" || audio?.scriptProvider === "mistral"
            ? null
            : 0,
        externalProviderGenerations:
          Number(image?.provider === "mistral") +
          Number(audio?.scriptProvider === "mistral"),
        externalProviderCost:
          image?.provider === "mistral" || audio?.scriptProvider === "mistral"
            ? null
            : 0,
        localComputeCostNotMetered: true,
      },
      creativeReview: {
        feedbackIds: (request.creativeFeedback ?? []).map((f) => f.feedbackId),
        notes: (request.creativeFeedback ?? []).flatMap((f) => f.creativeGuidance),
        status: request.creativeFeedback?.length ? "human-review-required" : "none",
        visualComplianceVerified: false,
      },
      rights: {
        publicationApproved: false,
        reviewRequired: true,
        scope: "local-preview",
      },
      completedAt: new Date().toISOString(),
    };
    await writeFile(
      artifactPath(id, "report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    return report;
  } catch (e) {
    const report = {
      ...base,
      status: "failed",
      code: e instanceof StudioError ? e.code : "STUDIO_PRODUCTION_FAILED",
      retryAllowed: false,
      providerOutcomeMayBeUnknown: true,
    };
    await writeFile(
      artifactPath(id, "report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    return report;
  }
}
export async function executeStudioMission(mission: any) {
  const capability = mission.requiredCapabilities?.[0];
  try {
    if (mission.requiredCapabilities.length !== 1)
      throw new StudioError("STUDIO_CAPABILITY_MUST_BE_ISOLATED");
    const v = mission.context?.metadata?.studioRequest;
    if (
      v?.parcelId !== mission.context?.id ||
      v?.seedId !== mission.context?.metadata?.seedId
    )
      throw new StudioError("STUDIO_PARCEL_MISMATCH");
    // The envelope, not untrusted nested input, supplies authorization and identity.
    const output = await runStudio(
      {
        ...v,
        operationId: mission.operationId,
        authorizedResources: mission.authorizedResources,
      },
      capability,
    );
    return {
      operationId: mission.operationId,
      status:
        output.status === "ready-for-review" ? "completed" : "needs-input",
      summary:
        output.status === "ready-for-review"
          ? "Fichiers produits et vérifiés ; revue créative requise."
          : "Production bloquée ou échouée ; consulter le rapport.",
      output,
      artifacts: "artifact" in output ? [output.artifact] : [],
    };
  } catch (e) {
    return {
      operationId: mission.operationId,
      status: "needs-input",
      summary: "Studio indisponible ou demande non autorisée.",
      output: {
        status: "blocked",
        code: e instanceof StudioError ? e.code : "STUDIO_UNAVAILABLE",
        published: false,
      },
    };
  }
}
