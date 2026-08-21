import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, ExternalLink, Gauge, Image as ImageIcon, Sprout, TriangleAlert } from "lucide-react";

/**
 * Ce que Publisher sait, et ce qu'il a réellement produit.
 *
 * Deux choses que rien n'exposait jusqu'ici :
 *
 * 1. Les Knowledge Packages. Ils gouvernent tout — sans paquet **vérifié**, le
 *    cycle n'appelle pas Mistral, c'est la garde qui empêche Gérard d'inventer.
 *    Aucun écran ne montrait lesquels étaient reconnus, donc une parcelle
 *    muette restait inexplicable.
 * 2. Les récoltes réelles. Le moteur enregistre une ligne par passage : après
 *    cinquante itérations, une parcelle occupe cinquante lignes. On voyait un
 *    journal d'exécution là où il fallait voir un livrable à sa version
 *    courante.
 */

const WORKER_BASE_URL = "https://blacklace-publisher-worker.benoitlubert.workers.dev";

function apiBase(): string {
  return String(import.meta.env.VITE_API_BASE_URL || WORKER_BASE_URL).trim().replace(/\/$/, "");
}

interface KnowledgeItem {
  id: string;
  title: string;
  universe: string;
  slug: string;
  tags: string[];
  isMock: boolean;
  excerpt: string;
  length: number;
}

interface KnowledgeResponse {
  configured: boolean;
  connected: boolean;
  source?: string;
  error?: string | null;
  total?: number;
  verified?: number;
  items: KnowledgeItem[];
}

interface IterationRow {
  id: string;
  seed_id: string;
  parcel_id: string;
  title: string;
  iteration_number: number;
  mode: string;
  content: string | null;
  visual_url: string | null;
  tool_combination: string | null;
  created_at: string;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  } catch (_) {
    return value;
  }
}

/**
 * Ne garde que la version la plus haute de chaque parcelle.
 *
 * Gérard améliore bel et bien ses textes d'une version à l'autre : c'est
 * l'affichage qui montrait le déroulé plutôt que le résultat.
 */
function latestPerSeed(rows: IterationRow[]): IterationRow[] {
  const best = new Map<string, IterationRow>();
  for (const row of rows) {
    const current = best.get(row.seed_id);
    if (!current || row.iteration_number > current.iteration_number) best.set(row.seed_id, row);
  }
  return [...best.values()].sort((a, b) => b.iteration_number - a.iteration_number);
}

function useJson<T>(path: string): { data: T | null; error: string | null; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`${apiBase()}${path}`, { headers: { Accept: "application/json" } })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (cancelled) return;
        // Un HTTP non-ok porte souvent le vrai message dans le corps : on le
        // remonte plutôt que d'afficher un code nu.
        if (!response.ok) throw new Error((payload as any)?.error || `HTTP ${response.status}`);
        setData(payload as T);
        setError(null);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [path]);

  return { data, error, loading };
}

interface UsageTotals {
  iterations: number;
  measured: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  images: number;
}

interface UsageResponse {
  configured: boolean;
  days?: number;
  error?: string;
  totals?: UsageTotals;
  byModel?: Array<UsageTotals & { model: string }>;
  byParcel?: Array<UsageTotals & { parcelId: string; title: string }>;
  firstMeasuredAt?: string | null;
  pricing?: {
    source: string;
    currency: string;
    imagePriced: boolean;
    note: string;
  };
  cost?: { text: number; images: number; total: number } | null;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function formatEuro(value: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(value);
}

function Empty({ message }: { message: string }) {
  return <p className="text-sm leading-relaxed text-muted-foreground">{message}</p>;
}

function Failure({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <p className="text-sm leading-relaxed text-destructive">{message}</p>
    </div>
  );
}

function KnowledgeSection() {
  const { data, error, loading } = useJson<KnowledgeResponse>("/api/knowledge");

  const mockCount = useMemo(() => (data?.items ?? []).filter((item) => item.isMock).length, [data]);

  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-serif text-lg">
          <BookOpen className="h-5 w-5 text-primary" />
          Knowledge Packages
        </CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Sans paquet vérifié, le cycle n'appelle pas Mistral. C'est ce qui empêche Gérard d'inventer.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && <Empty message="Lecture de Notion…" />}
        {error && <Failure message={error} />}

        {data && !error && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={data.connected ? "default" : "destructive"}>
                {data.connected ? "Notion connecté" : "Notion injoignable"}
              </Badge>
              <Badge variant="secondary">{data.total ?? 0} paquets</Badge>
              {mockCount > 0 && <Badge variant="destructive">{mockCount} de démonstration</Badge>}
            </div>

            {data.error && <Failure message={data.error} />}
            {data.items.length === 0 && <Empty message="Aucun paquet trouvé." />}

            <ul className="space-y-3">
              {data.items.map((item) => (
                <li key={item.id} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-foreground">{item.title}</span>
                    {/* Un paquet de démonstration pris pour une source réelle
                        serait exactement le faux succès qu'on traque. */}
                    {item.isMock
                      ? <Badge variant="destructive">Démonstration</Badge>
                      : <Badge variant="secondary">Vérifié</Badge>}
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{item.slug}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {item.excerpt}{item.length > item.excerpt.length ? " …" : ""}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function HarvestSection() {
  const { data, error, loading } = useJson<{ configured: boolean; iterations: IterationRow[] }>("/api/tentacles/iterations?limit=500");

  const parcels = useMemo(() => latestPerSeed(data?.iterations ?? []), [data]);
  const withVisual = parcels.filter((row) => row.visual_url).length;

  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-serif text-lg">
          <Sprout className="h-5 w-5 text-primary" />
          Récoltes réelles de Poulpe Fiction
        </CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Chaque parcelle à sa version courante, pas le journal d'exécution.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && <Empty message="Lecture des itérations…" />}
        {error && <Failure message={error} />}

        {data && !error && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{parcels.length} parcelles</Badge>
              <Badge variant={withVisual > 0 ? "default" : "secondary"}>{withVisual} avec visuel</Badge>
            </div>

            {parcels.length === 0 && <Empty message="Aucune récolte enregistrée." />}

            <ul className="space-y-3">
              {parcels.map((row) => (
                <li key={row.id} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-foreground">{row.title}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">v{row.iteration_number}</Badge>
                      {row.visual_url
                        ? (
                          <a
                            href={row.visual_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <ImageIcon className="h-3.5 w-3.5" />
                            Visuel
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )
                        : <span className="text-xs text-muted-foreground">Texte seul</span>}
                    </div>
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {row.parcel_id} · {row.mode} · {formatDate(row.created_at)}
                  </p>
                  {row.content
                    ? <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{row.content.slice(0, 600)}{row.content.length > 600 ? " …" : ""}</p>
                    : <Empty message="Cette version n'a produit aucun texte." />}
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function UsageSection() {
  const { data, error, loading } = useJson<UsageResponse>("/api/usage?days=30");

  const totals = data?.totals;
  // Un cycle sans relevé n'est pas un cycle gratuit : le distinguer évite une
  // facture faussement rassurante.
  const unmeasured = totals ? totals.iterations - totals.measured : 0;

  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-serif text-lg">
          <Gauge className="h-5 w-5 text-primary" />
          Consommation — 30 derniers jours
        </CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Tokens mesurés sur les relevés de Mistral. Le coût est calculé à partir des tarifs configurés.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && <Empty message="Lecture de la consommation…" />}
        {error && <Failure message={error} />}
        {data?.error && <Failure message={data.error} />}

        {totals && !error && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-md border border-border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Tokens</p>
                <p className="mt-1 text-xl font-medium text-foreground">{formatNumber(totals.totalTokens)}</p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Entrée / sortie</p>
                <p className="mt-1 text-sm text-foreground">
                  {formatNumber(totals.promptTokens)} / {formatNumber(totals.completionTokens)}
                </p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Images</p>
                <p className="mt-1 text-xl font-medium text-foreground">{formatNumber(totals.images)}</p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Coût estimé</p>
                <p className="mt-1 text-xl font-medium text-foreground">
                  {data.cost ? formatEuro(data.cost.total) : "—"}
                </p>
              </div>
            </div>

            {data.pricing && (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {data.cost ? `Texte ${formatEuro(data.cost.text)}, images ${formatEuro(data.cost.images)}. ` : ""}
                {data.pricing.note}
              </p>
            )}

            {unmeasured > 0 && (
              <Failure message={`${formatNumber(unmeasured)} itérations sur ${formatNumber(totals.iterations)} n'ont aucun relevé : elles sont antérieures à la mise en place de la mesure. Leur coût réel n'est pas nul, il est inconnu.`} />
            )}

            {(data.byParcel ?? []).filter((row) => row.totalTokens > 0).length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">Par parcelle</p>
                <ul className="space-y-2">
                  {(data.byParcel ?? []).filter((row) => row.totalTokens > 0).map((row) => (
                    <li key={row.parcelId} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                      <span className="truncate text-sm text-foreground">{row.title}</span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {formatNumber(row.totalTokens)} tk · {row.images} img
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function Jardin() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="font-serif text-2xl font-bold tracking-tight text-foreground">Jardin</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Ce que Publisher sait, et ce qu'il a réellement produit.
        </p>
      </header>

      <UsageSection />
      <KnowledgeSection />
      <HarvestSection />
    </div>
  );
}
