import { productionEngine, type ProductionRequest } from "./production-engine";
import { generatePostDraft } from "../services/mistral";
import { composeExpertise } from "../services/expertise-composer";
import { resolveKnowledgePackage } from "../services/knowledge-package-resolver";

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

function packageCandidates(mission: OctopusAdapterMission): unknown[] {
  const request = metadataValue(mission, "knowledgeRequest");
  const requestRecord = request && typeof request === "object" && !Array.isArray(request) ? request as Record<string, unknown> : {};
  return [
    metadataValue(mission, "knowledgeSlug"),
    requestRecord.subject,
    metadataValue(mission, "parcelId"),
    metadataValue(mission, "universe"),
    mission.context.label,
    mission.context.id,
    mission.title,
  ];
}

function needsKnowledge(mission: OctopusAdapterMission, diagnostics: Record<string, unknown>) {
  return {
    operationId: mission.operationId,
    status: "needs-input" as const,
    summary: "Publisher ne trouve pas de Knowledge Package Notion vérifié pour cette parcelle.",
    question: {
      id: `knowledge-${mission.operationId}`,
      key: "verified-knowledge-package",
      label: `Quel Knowledge Package Publisher doit-il utiliser pour « ${mission.context.label ?? mission.title} » ?`,
      reason: "La production ne doit pas être inventée à partir du seul nom de la parcelle.",
      inputType: "text",
      scope: "parcel",
    },
    output: { capability: "knowledge.search", diagnostics },
  };
}

function platformFor(mission: OctopusAdapterMission, capability: PublisherAdapterCapability): string {
  const explicit = stringValue(metadataValue(mission, "platform"));
  if (explicit) return explicit;
  const request = `${mission.title} ${mission.objective} ${mission.prompt ?? ""}`.toLowerCase();
  if (request.includes("linkedin")) return "LinkedIn";
  if (request.includes("instagram")) return "Instagram";
  if (capability === "content.article.write") return "Site web";
  return capability === "copy.generate" ? "Livrable Markdown" : "Instagram";
}

function productionPrompt(mission: OctopusAdapterMission, capability: PublisherAdapterCapability): string {
  const original = mission.prompt ?? mission.objective;
  if (capability !== "copy.generate") return original;
  const audience = stringValue(metadataValue(mission, "audience"));
  const format = stringValue(metadataValue(mission, "format"));
  const details = stringValue(metadataValue(mission, "details"));
  return [
    original,
    audience ? `Audience déjà choisie : ${audience}.` : "",
    format ? `Ton ou format déjà choisi : ${format}.` : "",
    details ? `Détails fournis : ${details}.` : "",
    "Rends maintenant un premier brouillon complet et directement exploitable.",
    "Ne transforme pas une demande de brouillon en questionnaire de cadrage.",
    "Pour un post social, produis le hook, le corps, la conclusion et un CTA prudent.",
  ].filter(Boolean).join("\n\n");
}

async function writeContent(
  mission: OctopusAdapterMission,
  capability: "copy.generate" | "content.article.write" | "content.social.write",
) {
  const knowledge = await resolveKnowledgePackage(packageCandidates(mission));
  if (!knowledge.verified) return needsKnowledge(mission, knowledge.diagnostics);

  const platform = platformFor(mission, capability);
  const prompt = productionPrompt(mission, capability);
  const expertise = composeExpertise({ universe: knowledge.slug, platform, prompt });
  const draft = await generatePostDraft({
    universe: knowledge.slug,
    agentName: stringValue(metadataValue(mission, "agentName")) ?? "Sofia",
    agentTone: stringValue(metadataValue(mission, "agentTone")) ?? "clair, documenté, créatif et sans promesse invérifiable",
    platform,
    prompt,
    knowledgeContext: knowledge.prompt,
    knowledgeSource: knowledge.source,
    expertiseContext: expertise.promptBlock,
    expertiseIds: expertise.profiles.map((profile) => profile.id),
    expertiseRecipeId: expertise.recipeId,
  });

  return {
    operationId: mission.operationId,
    status: "completed" as const,
    summary: `${capability} exécuté à partir du Knowledge Package ${knowledge.slug}.`,
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
      knowledgePackage: {
        slug: knowledge.slug,
        source: knowledge.source,
        verified: true,
        itemCount: knowledge.items.length,
      },
      isMock: draft.isMock,
      fallbackReason: draft.fallbackReason,
    },
  };
}

async function searchKnowledge(mission: OctopusAdapterMission) {
  const knowledge = await resolveKnowledgePackage(packageCandidates(mission));
  if (!knowledge.verified) return needsKnowledge(mission, knowledge.diagnostics);
  return {
    operationId: mission.operationId,
    status: "completed" as const,
    summary: `Knowledge Package ${knowledge.slug} préparé par Publisher.`,
    output: {
      capability: "knowledge.search",
      slug: knowledge.slug,
      source: knowledge.source,
      verified: true,
      context: knowledge.prompt,
      itemCount: knowledge.items.length,
      diagnostics: knowledge.diagnostics,
    },
  };
}

async function generateLanding(mission: OctopusAdapterMission) {
  const knowledge = await resolveKnowledgePackage(packageCandidates(mission));
  if (!knowledge.verified) return needsKnowledge(mission, knowledge.diagnostics);
  const request: ProductionRequest = {
    id: mission.operationId,
    capability: "landing-page",
    title: mission.title,
    objective: mission.objective,
    input: {
      ...(mission.context.metadata ?? {}),
      title: mission.title,
      objective: mission.objective,
      prompt: mission.prompt,
      verifiedKnowledge: knowledge.prompt,
      knowledgePackage: { slug: knowledge.slug, source: knowledge.source, verified: true },
    },
    preferredProducerId: "html-local",
  };
  const plan = productionEngine.plan(request);
  const report = await productionEngine.execute(plan, request);
  return {
    operationId: mission.operationId,
    status: report.status === "completed" ? "completed" as const : "failed" as const,
    summary: report.status === "completed" ? `Landing page produite avec le Knowledge Package ${knowledge.slug}.` : "La production de la landing page a échoué.",
    output: { capability: "landing.generate", plan, errors: report.errors, artifacts: report.artifacts, knowledgePackage: { slug: knowledge.slug, source: knowledge.source, verified: true } },
    artifacts: report.artifacts,
  };
}

export async function executePublisherAdapter(envelope: OctopusAdapterEnvelope) {
  if (envelope.contract !== "octopus-adapter-execution-v1") {
    return { operationId: envelope.mission?.operationId, status: "failed" as const, summary: "Contrat d’adaptateur non pris en charge.", output: {} };
  }
  const capability = requestedCapability(envelope.mission);
  if (!capability) {
    return { operationId: envelope.mission.operationId, status: "failed" as const, summary: "Publisher ne déclare aucune des capacités demandées.", output: { requestedCapabilities: envelope.mission.requiredCapabilities } };
  }
  if (capability === "copy.generate" || capability === "content.article.write" || capability === "content.social.write") return writeContent(envelope.mission, capability);
  if (capability === "knowledge.search") return searchKnowledge(envelope.mission);
  return generateLanding(envelope.mission);
}
