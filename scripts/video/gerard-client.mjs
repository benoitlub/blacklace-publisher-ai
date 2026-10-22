// Deterministic client for Gerard's existing Octopus. No creative agent/provider.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
export async function registerVideoCapabilities({
  octopusUrl = "http://127.0.0.1:3000",
  publisherUrl = "http://127.0.0.1:3001",
  fetchImpl = fetch,
} = {}) {
  const publisher = publisherUrl.replace(/\/$/, ""),
    octopus = octopusUrl.replace(/\/$/, "");
  const checked = await fetchImpl(`${publisher}/api/production/video/catalog`);
  const catalog = await checked.json();
  if (
    !checked.ok ||
    catalog.contract !== "publisher-video-catalog-v1" ||
    catalog.runtimeReady !== true
  )
    throw new Error("VIDEO_RUNTIME_UNAVAILABLE");
  const current = await fetchImpl(`${octopus}/adapters`),
    registry = await current.json();
  if (!current.ok || !Array.isArray(registry.adapters))
    throw new Error("OCTOPUS_REGISTRY_UNAVAILABLE");
  const existing = registry.adapters.find(
    (adapter) => adapter.id === "publisher",
  );
  const executeUrl = `${publisher}/api/octopus-adapter/execute`;
  if (existing && existing.executeUrl !== executeUrl)
    throw new Error("VIDEO_ADAPTER_DESTINATION_MISMATCH");
  // Extend this same local adapter; preserve its social/content capabilities.
  const response = await fetchImpl(`${octopus}/adapters/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(existing ?? {}),
      id: "publisher",
      name: existing?.name ?? "Blacklace Publisher",
      executeUrl,
      capabilities: [
        ...new Set([
          ...(existing?.capabilities ?? []),
          "video.catalog",
          "video.prepare",
          "video.render",
          "video.review",
        ]),
      ],
    }),
  });
  if (!response.ok) throw new Error("VIDEO_ADAPTER_REGISTRATION_FAILED");
  return response.json();
}
export function videoMission(
  videoPackage,
  { render = false, now = new Date() } = {},
) {
  const capability = render ? "video.render" : "video.prepare";
  const stable = sha(JSON.stringify(videoPackage));
  return {
    operationId: `gerard-${capability.replace(".", "-")}-${stable}-${now.getTime()}`,
    title: `Vidéo ${videoPackage.characterId}`,
    objective:
      "Exécuter le paquet vidéo choisi par Gérard, à coût externe nul, avec MP4 et rapport vérifiables, sans publication.",
    requiredCapabilities: [capability],
    authorizedResources: render ? ["video.render"] : [],
    context: {
      id: videoPackage.destination?.project,
      label: "Gérard",
      metadata: { videoPackage },
    },
  };
}
export function videoReviewMission(videoReview, { now = new Date() } = {}) {
  return {
    operationId: `gerard-video-review-${sha(JSON.stringify(videoReview))}-${now.getTime()}`,
    title: "Comparer la vidéo à la demande de Gérard",
    objective:
      "Enregistrer les défauts observés et les changements explicites pour la prochaine création, sans rendu automatique.",
    requiredCapabilities: ["video.review"],
    authorizedResources: ["video.review"],
    context: { id: "gerard-video-learning", metadata: { videoReview } },
  };
}
export async function submitVideoMission(
  mission,
  { octopusUrl = "http://127.0.0.1:3000", fetchImpl = fetch } = {},
) {
  const response = await fetchImpl(`${octopusUrl.replace(/\/$/, "")}/mission`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mission),
    signal: AbortSignal.timeout(180000),
  });
  const result = await response.json();
  if (!response.ok || !result || typeof result !== "object")
    throw new Error("OCTOPUS_VIDEO_RESPONSE_UNCONFIRMED");
  return result;
}
export async function retrieveVideo(
  result,
  { publisherUrl = "http://127.0.0.1:3001", outputDir, fetchImpl = fetch } = {},
) {
  const output = result?.output,
    artifact = output?.artifact;
  if (
    result?.status !== "completed" ||
    output.status !== "ready-for-review" ||
    !artifact ||
    artifact.mimeType !== "video/mp4" ||
    !/^[a-f0-9]{64}$/.test(artifact.id) ||
    !/^[a-f0-9]{64}$/.test(artifact.sha256)
  )
    throw new Error("VIDEO_NOT_READY");
  const base = new URL(publisherUrl),
    url = new URL(artifact.downloadUrl, base);
  if (
    url.origin !== base.origin ||
    url.pathname !==
      `/api/production/video/artifacts/${artifact.id}/video.mp4` ||
    url.search ||
    url.hash
  )
    throw new Error("UNEXPECTED_VIDEO_DOWNLOAD_URL");
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(60000),
    redirect: "error",
  });
  if (
    !response.ok ||
    !response.headers.get("Content-Type")?.startsWith("video/mp4") ||
    !response.body
  )
    throw new Error("VIDEO_DOWNLOAD_UNAVAILABLE");
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 32 * 1024 * 1024) throw new Error("VIDEO_DOWNLOAD_TOO_LARGE");
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  if (sha(bytes) !== artifact.sha256 || bytes.length !== artifact.bytes)
    throw new Error("VIDEO_DOWNLOAD_HASH_MISMATCH");
  if (!outputDir)
    return { artifact, verifiedBytes: bytes.length, report: output };
  await mkdir(outputDir, { recursive: true });
  const file = path.join(outputDir, `${artifact.id}.mp4`);
  try {
    await writeFile(file, bytes, { flag: "wx" });
  } catch (error) {
    if (
      error.code !== "EEXIST" ||
      sha(await readFile(file)) !== artifact.sha256
    )
      throw error;
  }
  const reportFile = path.join(outputDir, `${artifact.id}.report.json`);
  try {
    await writeFile(reportFile, JSON.stringify(output, null, 2) + "\n", {
      flag: "wx",
    });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  return {
    artifact,
    file,
    reportFile,
    verifiedBytes: bytes.length,
    report: output,
  };
}
async function main() {
  const args = process.argv.slice(2),
    requestPath = args[0];
  if (!requestPath)
    throw new Error(
      "Usage: node scripts/video/gerard-client.mjs request.json [--render] [--out directory]",
    );
  const videoPackage = JSON.parse(await readFile(requestPath, "utf8"));
  const render = args.includes("--render"),
    outIndex = args.indexOf("--out"),
    outputDir = outIndex < 0 ? undefined : args[outIndex + 1];
  if (render && !outputDir)
    throw new Error("Explicit --out directory required for MP4 retrieval.");
  const options = {
    octopusUrl: process.env.OCTOPUS_URL,
    publisherUrl: process.env.PUBLISHER_URL,
    outputDir,
  };
  if (args.includes("--register")) await registerVideoCapabilities(options);
  const result = await submitVideoMission(
    videoMission(videoPackage, { render }),
    options,
  );
  console.log(
    JSON.stringify(
      render ? await retrieveVideo(result, options) : result,
      null,
      2,
    ),
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
