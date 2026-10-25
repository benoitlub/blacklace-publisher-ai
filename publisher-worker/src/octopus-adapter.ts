import { businessCandidates } from "./composio-discovery";
import { resolveKnowledgePackage } from "./knowledge/knowledge-package-resolver";
import { buildObservatoryToolPack, getSql } from "./db";
import { discoverAutonomousGemTools } from "./autonomous-gems";

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
  "tool.execute",
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
  deps: { generateText: MistralTextExecutor; knowledgeEnv: KnowledgeEnvLike; publishSocial?: (input: Record<string, unknown>) => Promise<unknown>; searchBusinessSources?: (query: string, options: {operationId:string;dryRun:boolean;authorized:boolean}) => Promise<unknown>; discoverTools?: (query: string) => Promise<unknown> },
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
    if (capability === "business.sources.search" || capability === "tool.execute") {
      const request = isRecord(mission.context?.metadata?.["toolRequest"]) ? mission.context!.metadata!["toolRequest"] as Record<string, unknown> : {};
      if (capability === "tool.execute" && request.capability !== "business.sources.search") return {
        operationId,status:"needs-input",summary:"Utiliser la capacité métier gardée pour les actions externes, les médias payants ou la publication.",
        output:{capability,status:"blocked",reason:"GUARDED_CAPABILITY_REQUIRED",executed:false},
      };
      const query = stringValue(mission.prompt) ?? stringValue(mission.objective);
      if (!query || !deps.searchBusinessSources) return {operationId,status:"needs-input",summary:"Recherche B2B indisponible : requête ou transport manquant.",output:{capability:"business.sources.search",verified:false,candidates:[],status:"source-unavailable"}};
      try {
        const response = await deps.searchBusinessSources(query,{operationId,dryRun:request.dryRun !== false,authorized:mission.authorizedResources?.includes("tools.read")===true});
        const data=isRecord(response)?response:{};
        const output=data.capability === "business.sources.search" ? data : {capability:"business.sources.search",status:"sources-found",candidates:businessCandidates(response),verified:false,contacted:false,orders:0};
        const completed=["sources-found","no-sources","ready-to-read"].includes(String(output.status));
        return {operationId,status:completed?"completed":"needs-input",summary:completed?"Recherche B2B contrôlée ; les sources candidates ne sont pas des prospects qualifiés.":"Recherche B2B bloquée ; aucune réussite commerciale déclarée.",output};
      } catch {return {operationId,status:"failed",summary:"Échec du transport de recherche B2B.",output:{capability:"business.sources.search",status:"blocked",reason:"BUSINESS_SOURCES_UNAVAILABLE",candidates:[],verified:false}};}
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
      // Scout results are research candidates, never executable adapters.
      // A missing/offline catalog does not interrupt the existing Neon tool pack.
      const discoveries = await discoverAutonomousGemTools(deliverable);
      const known = new Set(pack.tools.map(tool => String(tool.url ?? '').toLowerCase()));
      const novel = discoveries.filter(tool => !known.has(tool.url.toLowerCase()));
      // Composio discovery is a separate, read-only inventory. Preserve the
      // existing Observatory and public scout results without presenting a
      // discovered Composio tool as an authorized/executable producer.
      let composioDiscovery: Record<string, unknown> | null = null;
      if (deps.discoverTools) {
        try {
          const discovered = await deps.discoverTools(deliverable || "web search");
          composioDiscovery = isRecord(discovered)
            ? { ...discovered, executionVerified: false }
            : { status: "unavailable", executionVerified: false };
        } catch {
          composioDiscovery = { status: "unavailable", executionVerified: false };
        }
      }
      return {
        operationId,
        status: "completed",
        summary: `Tool Pack préparé par Publisher pour ${seedId} (${pack.tools.length} outil(s), ${novel.length} pépite(s) à adapter).`,
        output: { capability, ...pack, tools: [...pack.tools, ...novel], scoutCandidates: novel.length,
          composioDiscovery, executable: false, authorizationRequired: true },
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
