import { resolveKnowledgePackage } from "./knowledge/knowledge-package-resolver";

/**
 * Octopus adapter surface, running on Cloudflare.
 *
 * Octopus only executes seven intrinsic capabilities itself; anything else
 * needs an external adapter that registers an `executeUrl` and answers the
 * `octopus-adapter-execution-v1` envelope. Publisher used to provide that from
 * the Render api-server, whose host is dead — so in practice the deployed
 * Octopus has had no live executor at all.
 *
 * This module moves that surface onto the Worker, which is already deployed,
 * already reaches Postgres over HTTP and already has a Cron Trigger to keep the
 * registration alive (Octopus stores adapters in an in-memory Map that does not
 * survive isolate recycling).
 *
 * Scope: the text capabilities, served by Mistral, plus knowledge.search.
 * Canva/production capabilities stay behind /api/production/execute and are not
 * exposed here yet.
 */

export const PUBLISHER_ADAPTER_ID = "publisher";
export const ADAPTER_EXECUTION_CONTRACT = "octopus-adapter-execution-v1";
export const DEFAULT_OCTOPUS_URL = "https://octopus-engine-app.benoitlubert.workers.dev";

/**
 * `content.generate` is first because it is the capability other services ask
 * for by default — metaverse-creator among them. Without it declared here,
 * Octopus finds no executor and answers `202 waiting-executor` forever.
 */
export const PUBLISHER_ADAPTER_CAPABILITIES = [
  "content.generate",
  "copy.generate",
  "content.article.write",
  "content.social.write",
  "knowledge.search",
] as const;

export type PublisherAdapterCapability = (typeof PUBLISHER_ADAPTER_CAPABILITIES)[number];

const TEXT_CAPABILITIES: readonly string[] = [
  "content.generate",
  "copy.generate",
  "content.article.write",
  "content.social.write",
];

export interface OctopusAdapterMission {
  operationId: string;
  title?: string;
  objective?: string;
  requiredCapabilities?: string[];
  authorizedResources?: string[];
  prompt?: string;
  context?: {
    id?: string;
    label?: string;
    objective?: string;
    metadata?: Record<string, unknown>;
  };
}

export interface OctopusAdapterEnvelope {
  contract?: string;
  adapterId?: string;
  mission?: OctopusAdapterMission;
}

export interface AdapterExecutionResult {
  operationId: string;
  status: "completed" | "failed" | "needs-input";
  summary: string;
  output: Record<string, unknown>;
  artifacts?: Array<Record<string, unknown>>;
}

export type MistralTextExecutor = (request: {
  title: string;
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}) => Promise<{ content: string; title: string; id: string }>;

export interface KnowledgeEnvLike {
  NOTION_API_KEY?: string;
  NOTION_DATABASE_ID?: string;
  NOTION_PAGE_ID?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** First declared capability the mission asks for, in declaration order. */
export function requestedCapability(mission: OctopusAdapterMission): PublisherAdapterCapability | undefined {
  const required = Array.isArray(mission.requiredCapabilities) ? mission.requiredCapabilities : [];
  return PUBLISHER_ADAPTER_CAPABILITIES.find((capability) => required.includes(capability));
}

function systemPromptFor(capability: PublisherAdapterCapability): string {
  switch (capability) {
    case "content.article.write":
      return "Tu rédiges un article complet, structuré et factuel. N'invente aucune donnée réelle manquante.";
    case "content.social.write":
      return "Tu rédiges un post social : accroche, corps, conclusion, puis un appel à l'action prudent.";
    case "copy.generate":
      return "Tu produis un livrable texte complet et directement exploitable. Ne transforme pas une demande de brouillon en questionnaire de cadrage.";
    default:
      // content.generate stays deliberately neutral: the caller owns the
      // framing, and Octopus must not acquire domain knowledge of its own.
      return "Tu produis le livrable textuel demandé, complet et directement exploitable, en suivant exactement les consignes fournies.";
  }
}

/**
 * Executes one mission. Never throws: a failure is reported as a `failed`
 * status so Octopus records a readable outcome instead of a transport error.
 */
export async function executeAdapterMission(
  envelope: OctopusAdapterEnvelope,
  deps: { generateText: MistralTextExecutor; knowledgeEnv: KnowledgeEnvLike },
): Promise<AdapterExecutionResult> {
  const mission = isRecord(envelope.mission) ? (envelope.mission as OctopusAdapterMission) : undefined;
  const operationId = stringValue(mission?.operationId) ?? `unknown-${Date.now()}`;

  if (!mission) {
    return {
      operationId,
      status: "failed",
      summary: "Enveloppe invalide : `mission` est requis.",
      output: { contract: ADAPTER_EXECUTION_CONTRACT },
    };
  }

  if (envelope.contract && envelope.contract !== ADAPTER_EXECUTION_CONTRACT) {
    return {
      operationId,
      status: "failed",
      summary: `Contrat non supporté : ${envelope.contract}.`,
      output: { expected: ADAPTER_EXECUTION_CONTRACT },
    };
  }

  const capability = requestedCapability(mission);

  if (!capability) {
    return {
      operationId,
      status: "failed",
      summary: "Aucune capacité demandée n'est fournie par Publisher.",
      output: {
        requiredCapabilities: mission.requiredCapabilities ?? [],
        providedCapabilities: [...PUBLISHER_ADAPTER_CAPABILITIES],
      },
    };
  }

  try {
    if (capability === "knowledge.search") {
      const knowledge = await resolveKnowledgePackage(deps.knowledgeEnv, [
        mission.context?.metadata?.["knowledgeSlug"],
        mission.context?.metadata?.["parcelId"],
        mission.context?.metadata?.["universe"],
        mission.context?.label,
        mission.context?.id,
        mission.title,
      ]);

      if (!knowledge.verified) {
        return {
          operationId,
          status: "needs-input",
          summary: "Publisher ne trouve pas de Knowledge Package vérifié pour cette parcelle.",
          output: { capability, slug: knowledge.slug, diagnostics: knowledge.diagnostics },
        };
      }

      return {
        operationId,
        status: "completed",
        summary: `Knowledge Package ${knowledge.slug} préparé par Publisher.`,
        output: {
          capability,
          slug: knowledge.slug,
          source: knowledge.source,
          verified: knowledge.verified,
          // `context` is what consumers read; `text` mirrors it so a generic
          // caller finds the payload without knowing this capability's shape.
          context: knowledge.prompt,
          text: knowledge.prompt,
        },
      };
    }

    if (TEXT_CAPABILITIES.includes(capability)) {
      const prompt = stringValue(mission.prompt) ?? stringValue(mission.objective);

      if (!prompt) {
        return {
          operationId,
          status: "failed",
          summary: "La mission ne porte ni `prompt` ni `objective` exploitable.",
          output: { capability },
        };
      }

      const title = stringValue(mission.title) ?? `Publisher · ${capability}`;
      const result = await deps.generateText({
        title,
        prompt,
        systemPrompt: systemPromptFor(capability),
      });

      return {
        operationId,
        status: "completed",
        summary: `${capability} exécutée par Publisher.`,
        // `text` is the field generic consumers read first; `content` and the
        // artifact repeat it so a caller expecting either convention works.
        output: { capability, text: result.content, content: result.content, producer: "mistral" },
        artifacts: [
          {
            id: result.id,
            kind: "text/markdown",
            title: result.title,
            content: result.content,
          },
        ],
      };
    }

    return {
      operationId,
      status: "failed",
      summary: `Capacité déclarée mais non implémentée sur ce Worker : ${capability}.`,
      output: { capability },
    };
  } catch (error) {
    return {
      operationId,
      status: "failed",
      summary: error instanceof Error ? error.message : "Exécution de la mission échouée.",
      output: { capability },
    };
  }
}

export interface RegistrationOutcome {
  registered: boolean;
  octopusUrl: string;
  status?: number;
  error?: string;
}

/**
 * Announces this Worker to Octopus as an executor.
 *
 * Octopus keeps registrations in memory, so this has to run again periodically
 * — the Worker's Cron Trigger is what keeps it alive.
 */
export async function registerWithOctopus(options: {
  octopusUrl: string;
  publicBaseUrl: string;
  version?: string;
}): Promise<RegistrationOutcome> {
  const octopusUrl = options.octopusUrl.replace(/\/$/, "");
  const publicBaseUrl = options.publicBaseUrl.replace(/\/$/, "");

  if (!publicBaseUrl) {
    return { registered: false, octopusUrl, error: "PUBLISHER_PUBLIC_URL is not configured" };
  }

  try {
    const response = await fetch(`${octopusUrl}/adapters/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: PUBLISHER_ADAPTER_ID,
        name: "Blacklace Publisher",
        version: options.version ?? "worker",
        capabilities: [...PUBLISHER_ADAPTER_CAPABILITIES],
        executeUrl: `${publicBaseUrl}/api/octopus-adapter/execute`,
        // Deliberately not /api/octopus-adapter/health: that path already
        // serves the octopus-witness view (GitHub Actions history of
        // octopus-engine), which says nothing about this adapter.
        healthUrl: `${publicBaseUrl}/api/adapter/health`,
        metadata: { owner: "publisher", contract: ADAPTER_EXECUTION_CONTRACT, runtime: "cloudflare-worker" },
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      const payload = await response.text().catch(() => "");
      return { registered: false, octopusUrl, status: response.status, error: payload.slice(0, 300) };
    }

    return { registered: true, octopusUrl, status: response.status };
  } catch (error) {
    return {
      registered: false,
      octopusUrl,
      error: error instanceof Error ? error.message : "Unreachable",
    };
  }
}
