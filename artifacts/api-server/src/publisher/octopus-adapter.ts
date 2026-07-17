import { productionEngine, type ProductionRequest } from "./production-engine";
import { generatePostDraft } from "../services/mistral";
import { fetchBlacklaceKnowledgeWithDiagnostics, buildKnowledgeContext } from "../services/notion";
import { composeExpertise } from "../services/expertise-composer";

export const PUBLISHER_ADAPTER_CAPABILITIES = [
  "copy.generate",
  "content.article.write",
  "content.social.write",
  "knowledge.search",
  "landing.generate",
] as const;

export type PublisherAdapterCapability = (typeof PUBLISHER_ADAPTER_CAPABILITIES)[number];

export interface OctopusAdapterMission {
  operationId: string;
  title: string;
  objective: string;
  requiredCapabilities: string[];
  authorizedResources: string[];
  prompt?: string;
  context: {
    id: string;
    label?: string;
    objective?: string;
    metadata?: Record<string, unknown>;
  };
}

export interface OctopusAdapterEnvelope {
  contract: "octopus-adapter-execution-v1";
  adapterId: string;
  mission: OctopusAdapterMission;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function metadataValue(mission: OctopusAdapterMission, key: string): unknown {
  return mission.context.metadata?.[key];
}

function requestedCapability(mission: OctopusAdapterMission): PublisherAdapterCapability | undefined {
  return PUBLISHER_ADAPTER_CAPABILITIES.find((capability) => mission.requiredCapabilities.includes(capability));
}

async function writeContent(
  mission: OctopusAdapterMission,
  capability: "copy.generate" | "content.article.write" | "content.social.write",
) {
  const universe = stringValue(metadataValue(mission, "universe")) ?? mission.context.label ?? "Blacklace";
  const platform = stringValue(metadataValue(mission, "platform")) ?? (
    capability === "content.article.write" ? "Site web" :
    capability === "copy.generate" ? "Livrable Markdown" :
    "Instagram"
  );
  const agentName = stringValue(metadataValue(mission, "agentName")) ?? "Sofia";
  const agentTone = stringValue(metadataValue(mission, "agentTone")) ?? "clair, documenté, créatif et sans promesse invérifiable";
  const knowledge = await fetchBlacklaceKnowledgeWithDiagnostics();
  const expertise = composeExpertise({ universe, platform, prompt: mission.prompt ?? mission.objective });
  const draft = await generatePostDraft({
    universe,
    agentName,
    agentTone,
    platform,
    prompt: mission.prompt ?? mission.objective,
    knowledgeContext: buildKnowledgeContext(knowledge.items, universe),
    knowledgeSource: knowledge.source,
    expertiseContext: expertise.promptBlock,
    expertiseIds: expertise.profiles.map((profile) => profile.id),
    expertiseRecipeId: expertise.recipeId,
  });

  return {
    operationId: mission.operationId,
    status: "completed" as const,
    summary: `${capability} exécuté par Publisher.`,
    output: {
      capability,
      title: draft.title,
      content: draft.content,
      text: draft.content,
      artifacts: [{
        id: `publisher-${mission.operationId}`,
        title: draft.title,
        type: "markdown",
        artifactType: "markdown",
        mimeType: "text/markdown; charset=utf-8",
        content: draft.content,
        artifact: draft.content,
      }],
      hashtags: draft.hashtags,
      provider: draft.provider,
      model: draft.model,
      knowledgeSource: draft.knowledgeSource,
      isMock: draft.isMock,
      fallbackReason: draft.fallbackReason,
    },
  };
}

async function searchKnowledge(mission: OctopusAdapterMission) {
  const universe = stringValue(metadataValue(mission, "universe")) ?? mission.context.label ?? "Blacklace";
  const knowledge = await fetchBlacklaceKnowledgeWithDiagnostics();
  return {
    operationId: mission.operationId,
    status: "completed" as const,
    summary: "Contexte documentaire préparé par Publisher.",
    output: {
      capability: "knowledge.search",
      universe,
      source: knowledge.source,
      context: buildKnowledgeContext(knowledge.items, universe),
      itemCount: knowledge.items.length,
    },
  };
}

async function generateLanding(mission: OctopusAdapterMission) {
  const input = {
    ...(mission.context.metadata ?? {}),
    title: mission.title,
    objective: mission.objective,
    prompt: mission.prompt,
  };
  const request: ProductionRequest = {
    id: mission.operationId,
    capability: "landing-page",
    title: mission.title,
    objective: mission.objective,
    input,
    preferredProducerId: "html-local",
  };
  const plan = productionEngine.plan(request);
  const report = await productionEngine.execute(plan, request);
  return {
    operationId: mission.operationId,
    status: report.status === "completed" ? "completed" as const : "failed" as const,
    summary: report.status === "completed" ? "Landing page produite par Publisher." : "La production de la landing page a échoué.",
    output: { capability: "landing.generate", plan, errors: report.errors, artifacts: report.artifacts },
    artifacts: report.artifacts,
  };
}

export async function executePublisherAdapter(envelope: OctopusAdapterEnvelope) {
  if (envelope.contract !== "octopus-adapter-execution-v1") {
    return { operationId: envelope.mission?.operationId, status: "failed" as const, summary: "Contrat d’adaptateur non pris en charge.", output: {} };
  }
  const capability = requestedCapability(envelope.mission);
  if (!capability) {
    return {
      operationId: envelope.mission.operationId,
      status: "failed" as const,
      summary: "Publisher ne déclare aucune des capacités demandées.",
      output: { requestedCapabilities: envelope.mission.requiredCapabilities },
    };
  }
  if (capability === "copy.generate" || capability === "content.article.write" || capability === "content.social.write") {
    return writeContent(envelope.mission, capability);
  }
  if (capability === "knowledge.search") return searchKnowledge(envelope.mission);
  return generateLanding(envelope.mission);
}
