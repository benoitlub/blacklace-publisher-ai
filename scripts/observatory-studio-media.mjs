import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const root = process.cwd();
const catalogPath = path.resolve(root, "data/studio-inputs/assets.json");
const outputPath = path.resolve(root, "public/knowledge-packs/studio-media-inventory.json");
const catalogRoot = await fs.realpath(path.dirname(catalogPath));
const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
if (!Array.isArray(catalog.assets)) throw new Error("STUDIO_ASSET_CATALOG_INVALID");

const accepted = [];
const skipped = [];
for (const entry of catalog.assets) {
  const id = String(entry?.id ?? "(invalid)");
  try {
    if (!entry || typeof entry.id !== "string" || typeof entry.parcelId !== "string" ||
        typeof entry.file !== "string" || !/^[a-f0-9]{64}$/i.test(entry.sha256 ?? "")) {
      throw new Error("INVALID_ASSET_ENTRY");
    }
    const rights = entry.rights;
    if (!rights || !["CC0-1.0", "CC-BY-4.0", "LicenseRef-Owner-Authorized-Preview"].includes(rights.license) ||
        !["commercial", "local-preview"].includes(rights.scope) ||
        (rights.license === "LicenseRef-Owner-Authorized-Preview" && rights.scope !== "local-preview") ||
        !rights.source || !rights.attribution) throw new Error("MEDIA_RIGHTS_UNVERIFIED");
    const file = await fs.realpath(path.resolve(catalogRoot, entry.file));
    if (!file.startsWith(catalogRoot + path.sep)) throw new Error("MEDIA_PATH_OUTSIDE_CATALOG");
    const bytes = await fs.readFile(file);
    if (bytes.length > 30 * 1024 * 1024 ||
        createHash("sha256").update(bytes).digest("hex").toLowerCase() !== entry.sha256.toLowerCase()) {
      throw new Error("MEDIA_HASH_MISMATCH");
    }
    accepted.push({
      id: entry.id, parcelId: entry.parcelId, sha256: entry.sha256,
      license: rights.license, scope: rights.scope, source: rights.source,
      attribution: rights.attribution, studioAssetId: entry.id,
    });
  } catch (error) {
    skipped.push({ id, reason: error.code === "ENOENT" ? "MEDIA_FILE_MISSING" : error.message });
  }
}
const pack = {
  version: 1, source: "publisher-studio-catalog", publicationEnabled: false,
  accepted, skipped, acceptedCount: accepted.length, skippedCount: skipped.length,
};
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(pack, null, 2) + "\n");
console.log(`Studio media inventory: ${accepted.length} accepted, ${skipped.length} skipped`);
