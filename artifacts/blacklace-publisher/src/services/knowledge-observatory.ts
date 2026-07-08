import type { KnowledgeObservatoryResult, ObservatorySourceInput } from "@/models/knowledge-observatory";
import { normalizeSource } from "@/connectors/source-connectors";
import { observeSource } from "@/observation/observe-source";
import { extractKnowledge } from "@/extractors/extract-knowledge";
import { buildKnowledgePack } from "@/knowledge/build-knowledge-pack";
import { exportKnowledgePackToOctopus } from "@/export/octopus-export";

export function runKnowledgeObservatory(input: ObservatorySourceInput): KnowledgeObservatoryResult {
  const source = normalizeSource(input);
  const observation = observeSource(source);
  const extraction = extractKnowledge(observation);
  const pack = buildKnowledgePack(observation, extraction);
  const exportResult = exportKnowledgePackToOctopus(pack);

  return {
    observation,
    extraction,
    knowledge: pack.themes,
    pack,
    exportResult,
  };
}
