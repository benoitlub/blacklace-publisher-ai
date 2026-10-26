import { readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import {
  command,
  probe,
  decode,
  hash,
  registeredAsset,
  StudioError,
} from "./runtime";
import { requirePermission, type StudioRequest } from "./request";
export async function produceImage(
  request: StudioRequest,
  dir: string,
  fetchImpl = fetch,
): Promise<Record<string, any>> {
  let source: string,
    provenance: Record<string, any>,
    crop: string = "";
  if (request.assetId) {
    const asset = await registeredAsset(request.assetId, request.parcelId);
    source = asset.file;
    const p = await probe(source),
      v = p.streams.find((s) => s.codec_type === "video");
    if (!v || !["png", "mjpeg", "webp"].includes(v.codec_name))
      throw new StudioError("IMAGE_FILE_INVALID");
    if (asset.crop) {
      const c = asset.crop;
      if (
        !Object.values(c).every(Number.isInteger) ||
        c.x < 0 ||
        c.y < 0 ||
        c.width < 1 ||
        c.height < 1 ||
        c.x + c.width > v.width ||
        c.y + c.height > v.height
      )
        throw new StudioError("IMAGE_CROP_INVALID");
      crop = `crop=${c.width}:${c.height}:${c.x}:${c.y},`;
    }
    provenance = {
      provider: "registered-media",
      assetId: asset.id,
      sourceSha256: asset.sha256,
      rights: asset.rights,
      sourceDimensions: { width: v.width, height: v.height },
      crop: asset.crop ?? null,
    };
  } else {
    requirePermission(request, "mistral.image");
    if (!request.imagePrompt)
      throw new StudioError("PARCEL_IMAGE_PROMPT_REQUIRED");
    // Reuse the existing Publisher Worker. Never infer success from its JSON.
    const base = (
      process.env.PUBLISHER_WORKER_URL ||
      process.env.PUBLISHER_URL ||
      "https://blacklace-publisher-worker.benoitlubert.workers.dev"
    ).replace(/\/$/, "");
    const r = await fetchImpl(
      `${base}/api/production/mistral-image/test?prompt=${encodeURIComponent(request.imagePrompt)}`,
      { signal: AbortSignal.timeout(90000), redirect: "error" },
    );
    const result = (await r.json()) as any;
    const id = result?.result?.fileId;
    if (!r.ok || result.status !== "generated" || typeof id !== "string" || !id)
      throw new StudioError("MISTRAL_IMAGE_UNCONFIRMED");
    const response = await fetchImpl(
      `${base}/api/production/mistral-image/content?fileId=${encodeURIComponent(id)}`,
      { signal: AbortSignal.timeout(90000), redirect: "error" },
    );
    if (!response.ok || !response.body)
      throw new StudioError("MISTRAL_IMAGE_DOWNLOAD_FAILED");
    const parts: Uint8Array[] = [];
    let size = 0;
    for await (const part of response.body) {
      size += part.length;
      if (size > 30 * 1024 * 1024)
        throw new StudioError("MISTRAL_IMAGE_TOO_LARGE");
      parts.push(part);
    }
    const bytes = Buffer.concat(parts);
    source = path.join(dir, "source-image");
    await writeFile(source, bytes);
    const p = await probe(source);
    if (!p.streams.some((s) => ["png", "mjpeg", "webp"].includes(s.codec_name)))
      throw new StudioError("MISTRAL_IMAGE_FILE_INVALID");
    provenance = {
      provider: "mistral",
      fileId: id,
      prompt: request.imagePrompt,
      sourceSha256: hash(bytes),
      rights: {
        license: "LicenseRef-Mistral-Output-Review-Required",
        scope: "local-preview",
        source: "https://legal.mistral.ai/terms",
        attribution:
          "Mistral generated output; input rights and provider terms require review",
      },
      externalProviderCost: null,
    };
  }
  await decode(source);
  if (source !== path.join(dir, "source-image"))
    await copyFile(source, path.join(dir, "source-image"));
  await command("ffmpeg", [
    "-v",
    "error",
    "-nostdin",
    "-y",
    "-i",
    source,
    "-vf",
    `${crop}scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x0c0814,setsar=1`,
    "-frames:v",
    "1",
    "-threads",
    "2",
    path.join(dir, "image.png"),
  ]);
  const output = await probe(path.join(dir, "image.png"));
  if (!output.streams.some((s) => s.width === 1080 && s.height === 1920))
    throw new StudioError("IMAGE_DIMENSIONS_INVALID");
  return {
    ...provenance,
    verifiedFile: true,
    outputSha256: hash(await readFile(path.join(dir, "image.png"))),
    width: 1080,
    height: 1920,
  };
}
