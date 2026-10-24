import { resolveKnowledgePackage } from "./knowledge/knowledge-package-resolver";
import { buildObservatoryToolPack, getSql } from "./db";

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
  "social.publish",
  "knowledge.search",
  "tool.search",
  "business.sources.search",
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
  DATABASE_URL?: any;
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
  deps: { generateText: MistralTextExecutor; knowledgeEnv: KnowledgeEnvLike; publishSocial?: (input: Record<string, unknown>) => Promise<unknown>; searchBusinessSources?: (query: string) => Promise<unknown> },
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
    if (capability === "business.sources.search") {
      const query = stringValue(mission.prompt) ?? stringValue(mission.objective);
      if (!query || !deps.searchBusinessSources) return {
        operationId, status: "needs-input", summary: "Recherche B2B indisponible : requête ou connecteur manquant.",
        output: { capability, verified: false, candidates: [], status: "source-unavailable" },
      };
      const response = await deps.searchBusinessSources(query);
      const data = isRecord(response) ? response : {};
      const raw = Array.isArray(data["citations"]) ? data["citations"] : Array.isArray((data["data"] as any)?.citations) ? (data["data"] as any).citations : [];
      const candidates = raw.slice(0, 10).filter(isRecord).map(item => ({
        title: stringValue(item["title"]) ?? stringValue(item["name"]),
        url: stringValue(item["url"]) ?? stringValue(item["link"]),
        snippet: stringValue(item["snippet"]) ?? stringValue(item["description"]),
        verification: "search-result-only",
      })).filter(item => item.title && item.url && /^https?:\/\//i.test(item.url));
      return { operationId, status: "completed", summary: `Recherche B2B : ${candidates.length} source(s) publiques candidates, non qualifiées.`,
        output: { capability, status: candidates.length ? "sources-found" : "no-sources", verified: false, candidates, contacted: false, orders: 0 } };
    }
    if (capability === "tool.search") {
      const seedId = stringValue(mission.context?.metadata?.["seedId"])
        ?? stringValue(mission.context?.metadata?.["parcelId"])
        ?? stringValue(mission.context?.id)
        ?? stringValue(mission.title)
        ?? operationId;
      const deliverable = stringValue(mission.context?.metadata?.["deliverable"])
        ?? stringValue(mission.context?.metadata?.["capability"])
        ?? stringValue(mission.objective)
        ?? "";
      const gardenContext = isRecord(mission.context?.metadata?.["gardenContext"])
        ? mission.context?.metadata?.["gardenContext"] as Record<string, unknown>
        : undefined;
      const sql = await getSql(deps.knowledgeEnv);
      const pack = await buildObservatoryToolPack(sql, { seedId, deliverable, gardenContext });
      return {
        operationId,
        status: "completed",
        summary: `Tool Pack préparé par Publisher pour ${seedId} (${pack.tools.length} outil(s)).`,
        output: { capability, ...pack, executable: false, authorizationRequired: true },
      };
    }

    if (capability === "social.publish") {
      const approved = mission.authorizedResources?.includes("social.publish") === true;
      const destination = stringValue(mission.context?.metadata?.["destination"]);
      const content = stringValue(mission.context?.metadata?.["content"]) ?? stringValue(mission.prompt);
      if (!approved) {
        return {
          operationId,
          status: "needs-input",
          summary: "Publication préparée mais validation humaine requise avant toute diffusion externe.",
          output: {
            capability,
            authorizationRequired: true,
            requiredAuthorization: "social.publish",
            destination: destination ?? null,
            content: content ?? null,
            executable: false,
          },
        };
      }
      const publication = mission.context?.metadata?.["socialPublication"];
      if (!deps.publishSocial || !isRecord(publication)) {
        return { operationId, status: "needs-input", summary: "La demande de publication structurée ou son exécuteur est indisponible.",
          output: { capability, executable: false, authorizationRequired: false, provider: isRecord(publication) ? publication.transport ?? "metricool" : null } };
      }
      const outcome = await deps.publishSocial({ ...publication, operationId: stringValue(publication.operationId) ?? operationId });
      const output = isRecord(outcome) ? outcome : { status: "unconfirmed", scheduled: false };
      const confirmed = typeof output.postId === "string" && Boolean(output.postId.trim()) &&
        ((output.status === "confirmed-scheduled" && output.scheduled === true) || (output.status === "confirmed-published" && output.published === true));
      const preview = output.status === "ready-to-schedule" && publication.dryRun !== false;
      return { operationId, status: confirmed || preview ? "completed" : "needs-input",
        summary: confirmed ? "Statut confirmé par une lecture du fournisseur demandé." : preview ? "Parcours vérifié en lecture seule ; aucune programmation." : "Publication conservée ; la programmation n’est pas confirmée.",
        output: { capability, ...output, executable: false, provider: publication.transport ?? "metricool" } };

    }

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
  fetcher?: typeof fetch;
}): Promise<RegistrationOutcome> {
  const octopusUrl = options.octopusUrl.replace(/\/$/, "");
  const publicBaseUrl = options.publicBaseUrl.replace(/\/$/, "");

  if (!publicBaseUrl) {
    return { registered: false, octopusUrl, error: "PUBLISHER_PUBLIC_URL is not configured" };
  }

  try {
    const requestFetch = options.fetcher ?? fetch;
    const response = await requestFetch(`${octopusUrl}/adapters/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: PUBLISHER_ADAPTER_ID,
        name: "Blacklace Publisher",
        version: options.version ?? "worker",
        // Reserve copy.generate for the native Octopus Mistral resource.
        // Publisher remains the executor for content.generate and knowledge.search.
        capabilities: PUBLISHER_ADAPTER_CAPABILITIES.filter((capability) => capability !== "copy.generate"),
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
