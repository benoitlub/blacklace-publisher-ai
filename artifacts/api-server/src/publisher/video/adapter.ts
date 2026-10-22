import { prepareVideoPackage, VideoError } from "./package";
import { renderVideo, reviewVideo, videoCatalog } from "./render";
export const VIDEO_CAPABILITIES = [
  "video.catalog",
  "video.prepare",
  "video.render",
  "video.review",
] as const;
export async function executeVideoMission(mission: {
  operationId: string;
  requiredCapabilities: string[];
  authorizedResources: string[];
  context: { metadata?: Record<string, unknown> };
}) {
  const capability = mission.requiredCapabilities[0];
  const base = { operationId: mission.operationId };
  if (mission.requiredCapabilities.length !== 1)
    return {
      ...base,
      status: "needs-input" as const,
      summary: "Une seule capacité vidéo par mission.",
      output: { code: "VIDEO_CAPABILITY_MUST_BE_ISOLATED" },
    };
  if (
    ["video.render", "video.review"].includes(capability) &&
    !mission.authorizedResources?.includes(capability)
  )
    return {
      ...base,
      status: "needs-input" as const,
      summary: "Autorisation explicite requise pour cette action locale.",
      output: {
        code: "VIDEO_RESOURCE_AUTHORIZATION_REQUIRED",
        externalProviderCharge: 0,
      },
    };
  try {
    const metadata = mission.context?.metadata ?? {};
    if (capability === "video.catalog")
      return {
        ...base,
        status: "completed" as const,
        summary: "Catalogue des capacités vérifiées et de leurs limites.",
        output: await videoCatalog(),
      };
    if (capability === "video.prepare")
      return {
        ...base,
        status: "completed" as const,
        summary: "Demande de Gérard validée, sans rendu ni dépense.",
        output: {
          status: "prepared",
          videoPackage: prepareVideoPackage(metadata.videoPackage),
          externalProviderCharge: 0,
          publishingEnabled: false,
        },
      };
    if (capability === "video.review")
      return {
        ...base,
        status: "completed" as const,
        summary:
          "Comparaison enregistrée ; prochaine demande préparée sans rendu automatique.",
        output: await reviewVideo(metadata.videoReview),
      };
    const report = await renderVideo(metadata.videoPackage);
    const ready = report.status === "ready-for-review";
    return {
      ...base,
      status: ready ? ("completed" as const) : ("failed" as const),
      summary: ready
        ? "MP4 créé et contrôlé ; validation créative requise, aucune publication."
        : "Production locale échouée ; consulter le rapport.",
      output: report,
      artifacts: ready && "artifact" in report ? [report.artifact] : [],
    };
  } catch (error) {
    return {
      ...base,
      status: "needs-input" as const,
      summary:
        "La demande vidéo reste à corriger ou ses dépendances sont indisponibles.",
      output: {
        status: "blocked",
        code:
          error instanceof VideoError ? error.code : "LOCAL_VIDEO_UNAVAILABLE",
        details: error instanceof VideoError ? error.details : [],
        externalProviderCharge: 0,
        publishingEnabled: false,
      },
    };
  }
}
