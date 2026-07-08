import type { KnowledgePack, OctopusExportResult } from "@/models/knowledge-observatory";

export function exportKnowledgePackToOctopus(pack: KnowledgePack): OctopusExportResult {
  return {
    exported: true,
    mode: "mock",
    message: "Export mock pret : aucun appel reseau, aucune dependance directe a Octopus Engine.",
    packId: pack.id,
    exportedAt: new Date().toISOString(),
  };
}
