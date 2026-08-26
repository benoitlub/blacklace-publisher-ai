import type { KnowledgePack, SourceKind } from "@/models/knowledge-observatory";
import type { ObservationDecision } from "@/models/observation-memory";
import type { ObservatorySourceRecord } from "@/models/observatory-source";
import type { PublisherOctopusTranslation } from "@/services/octopus-observation";
import { apiUrl } from "@/services/api-base";

/**
 * Persistance des sources de l'Observatoire.
 *
 * L'Observatoire n'écrivait auparavant que dans le localStorage : une source
 * ajoutée depuis le dashboard n'atteignait jamais le serveur, donc ni un
 * autre appareil ni le job nocturne GitHub Actions ne pouvaient la voir.
 * Ces appels écrivent dans la table Neon `observatory_sources` via le Worker
 * Cloudflare, seul backend déployé à disposer de la connexion base.
 */

export interface PersistObservatorySourceInput {
  id?: string;
  kind: SourceKind;
  value: string;
  name: string;
  category?: string;
  summary?: string;
  confidence?: number;
  language?: string;
  tags?: string[];
  pack?: KnowledgePack;
  features?: string[];
  patterns?: string[];
  recommendations?: string[];
}

export interface PersistObservatorySourceResult {
  status: string;
  source: ObservatorySourceRecord;
  /** Absent quand Octopus était injoignable — la source est persistée quand même. */
  publisher?: PublisherOctopusTranslation;
  octopusError?: string;
}

async function readError(response: Response): Promise<string> {
  const payload = await response.json().catch(() => ({})) as { error?: string; summary?: string };
  return payload.error || payload.summary || `API Publisher indisponible (${response.status}).`;
}

export async function persistObservatorySource(
  input: PersistObservatorySourceInput,
): Promise<PersistObservatorySourceResult> {
  const response = await fetch(apiUrl("/observatory/sources"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) throw new Error(await readError(response));

  const payload = await response.json() as Partial<PersistObservatorySourceResult>;
  if (!payload.source) throw new Error("La réponse de l'API ne contient aucune source persistée.");
  return payload as PersistObservatorySourceResult;
}

export async function listObservatorySources(): Promise<ObservatorySourceRecord[]> {
  const response = await fetch(apiUrl("/observatory/sources"));
  if (!response.ok) throw new Error(await readError(response));
  const payload = await response.json() as { configured?: boolean; sources?: ObservatorySourceRecord[] };
  if (payload.configured === false) throw new Error("La base Neon n'est pas configurée côté Publisher.");
  return Array.isArray(payload.sources) ? payload.sources : [];
}

export async function updateObservatorySourceDecision(
  id: string,
  decision: ObservationDecision,
): Promise<ObservatorySourceRecord> {
  const response = await fetch(apiUrl(`/observatory/sources/${encodeURIComponent(id)}/decision`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision }),
  });
  if (!response.ok) throw new Error(await readError(response));
  const payload = await response.json() as { source?: ObservatorySourceRecord };
  if (!payload.source) throw new Error("La réponse de l'API ne contient aucune source.");
  return payload.source;
}
