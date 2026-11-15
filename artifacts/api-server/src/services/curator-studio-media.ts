import { readFile } from "node:fs/promises";
import path from "node:path";
import { projectRoot, registeredAsset } from "../publisher/studio/runtime.js";
import type { CuratorSignal } from "./autonomous-curator.js";

/**
 * Bridge between Publisher's existing Studio asset registry and its curator.
 * This is a metadata-only bridge: it never fetches external accounts, copies
 * media, changes Studio permissions or enables publication.
 */
export async function studioMediaCuratorSignals(): Promise<{
  signals: CuratorSignal[];
  skipped: { id: string; reason: string }[];
}> {
  const catalogPath = path.resolve(process.env.PUBLISHER_STUDIO_CATALOG ||
    path.join(projectRoot(), "data/studio-inputs/assets.json"));
  const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as {
    assets?: { id: string; parcelId: string; sha256: string }[];
  };
  if (!Array.isArray(catalog.assets)) throw new Error("STUDIO_ASSET_CATALOG_INVALID");
  const signals: CuratorSignal[] = [];
  const skipped: { id: string; reason: string }[] = [];
  for (const entry of catalog.assets) {
    const id = typeof entry?.id === "string" ? entry.id : "(invalid)";
    if (!entry || typeof entry.parcelId !== "string" || typeof entry.sha256 !== "string") {
      skipped.push({ id, reason: "INVALID_ASSET_ENTRY" });
      continue;
    }
    try {
      // Reuse Studio's realpath, scope, rights and hash verification.
      const asset = await registeredAsset(entry.id, entry.parcelId);
      signals.push({
        id: `studio-media:${asset.parcelId}:${asset.id}`,
        title: `Média enregistré ${asset.id}`,
        source: "publisher-studio-catalog",
        capturedAt: new Date().toISOString(),
        kind: "research",
        summary: `Média existant vérifié pour la parcelle ${asset.parcelId}; aperçu uniquement.`,
        tags: ["existing-media", "studio", asset.parcelId],
        missionIds: [asset.parcelId],
        claims: [`sha256:${asset.sha256}`, `rights-scope:${asset.rights.scope}`],
        evidenceRefs: [asset.rights.source, `studio-asset:${asset.id}`],
      });
    } catch (error) {
      skipped.push({ id, reason: error instanceof Error ? error.message : "MEDIA_VALIDATION_FAILED" });
    }
  }
  return { signals, skipped };
}
