import { productionEngine, type ProductionRequest } from "./production-engine";
import { generatePostDraft } from "../services/mistral";
import { composeExpertise } from "../services/expertise-composer";
import { resolveKnowledgePackage } from "../services/knowledge-package-resolver";

export const PUBLISHER_ADAPTER_CAPABILITIES = [
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

function packageCandidates(mission: OctopusAdapterMission): unknown[] {
  return [
    metadataValue(mission, "knowledgeSlug"),
    metadataValue(mission, "clientId"),
    metadataValue(mission, "parcelId"),
    metadataValue(mission, "universe"),
    mission.context.label,
    mission.context.id,
    mission.title,
  ];
}

function needsInput(mission: OctopusAdapterMission, label: string) {
  return {
    operationId: mission.operationId,
    status: "needs-input" as const,
    summary: "Publisher refuse de produire sans contexte client ou produit vérifié.",
    question: {
      id: `knowledge-${mission.operationId}`,
      key: "verified-client-or-product-context",
      label,
      reason: "Cette information manque au Knowledge Package vérifié.",
      inputType: "long-text",
      scope: "parcel",
    },
    output: { capability: "knowledge.search", missingFacts: ["verified-client-or-product-context"] },
  };
}

async function writeContent(mission: OctopusAdapterMission, capability: "content.article.write" | "content.social.write") {
  const platform = stringValue(metadataValue(mission, "platform")) ?? (capability === "content.article.write" ? "Site web" : "Instagram");
  const agentName = stringValue(metadataValue(mission, "agentName")) ?? "Sofia";
  const agentTone = stringValue(metadataValue(mission, "agentTone")) ?? "clair, documenté, créatif et sans promesse invérifiable";
  const knowledge = await resolveKnowledgePackage(packageCandidates(mission));
  if (!knowledge.verified) {
    return needsInput(mission, `Que désigne précisément « ${mission.context.label ?? mission.title} » et quels faits vérifiés Publisher peut-il utiliser ?`);
  }

  const expertise = composeExpertise({ universe: knowledge.slug, platform, prompt: mission.prompt ?? mission.objective });
  const draft = await generatePostDraft({
    universe: knowledge.slug,
    agentName,
    agentTone,
    platform,
    prompt: mission.prompt ?? mission.objective,
    knowledgeContext: knowledge.prompt,
    knowledgeSource: knowledge.source,
    expertiseContext: expertise.promptBlock,
    expertiseIds: expertise.profiles.map((profile) => profile.id),
    expertiseRecipeId: expertise.recipeId,
  });

  return {
    operationId: mission.operationId,
    status: "completed" as const,
    summary: `${capability} exécuté par Publisher à partir d'un Knowledge Package vérifié.`,
    output: {
      capability,
      title: draft.title,
      content: draft.content,
      hashtags: draft.hashtags,
      provider: draft.provider,
      model: draft.model,
      knowledgeSource: draft.knowledgeSource,
      knowledgePackage: { slug: knowledge.slug, verified: knowledge.verified, itemCount: knowledge.items.length },
      isMock: draft.isMock,
      fallbackReason: draft.fallbackReason,
    },
  };
}

async function searchKnowledge(mission: OctopusAdapterMission) {
  const knowledge = await resolveKnowledgePackage(packageCandidates(mission));
  if (!knowledge.verified) {
    return needsInput(mission, `Quelles informations vérifiées dois-je connaître sur « ${mission.context.label ?? mission.title} » ?`);
  }
  return {
    operationId: mission.operationId,
    status: "completed" as const,
    summary: "Knowledge Package vérifié préparé par Publisher.",
    output: {
      capability: "knowledge.search",
      slug: knowledge.slug,
      source: knowledge.source,
      context: knowledge.prompt,
      itemCount: knowledge.items.length,
      verified: true,
    },
  };
}

async function generateLanding(mission: OctopusAdapterMission) {
  const knowledge = await resolveKnowledgePackage(packageCandidates(mission));
  if (!knowledge.verified) {
    return needsInput(mission, `Que vend ou présente exactement « ${mission.context.label ?? mission.title} » ?`);
  }
  const input = {
    ...(mission.context.metadata ?? {}),
    title: mission.title,
    objective: mission.objective,
    prompt: mission.prompt,
    verifiedKnowledge: knowledge.prompt,
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
    summary: report.status === "completed" ? "Landing page produite à partir d'un Knowledge Package vérifié." : "La production de la landing page a échoué.",
    output: { capability: "landing.generate", plan, errors: report.errors, knowledgePackage: { slug: knowledge.slug, verified: true } },
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
  if (capability === "content.article.write" || capability === "content.social.write") return writeContent(envelope.mission, capability);
  if (capability === "knowledge.search") return searchKnowledge(envelope.mission);
  return generateLanding(envelope.mission);
}
