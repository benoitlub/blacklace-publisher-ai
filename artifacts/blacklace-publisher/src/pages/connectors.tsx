import { useEffect, useState } from "react";
import { useListConnectors, getListConnectorsQueryKey, useTestConnector } from "@workspace/api-client-react";
import type { ConnectorTestResult } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { Plug, Activity, Key, Clock, RefreshCw, ExternalLink, Server, Globe2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

const STATUS_COLORS: Record<string, string> = {
  connected: "text-green-500",
  disconnected: "text-muted-foreground",
  error: "text-destructive",
  mock: "text-amber-500",
};

const CONNECTOR_FAMILIES = [
  { id: "knowledge", label: "Memoire & connaissance", description: "Sources de reference utilisees par Publisher AI.", keywords: ["notion", "knowledge", "source", "memory"] },
  { id: "ai", label: "IA & generation", description: "Gateway et providers de generation serveur.", keywords: ["ai", "gateway", "mistral", "openai", "gemini", "groq", "huggingface"] },
  { id: "publishing", label: "Publication & reseaux", description: "Canaux de diffusion et comptes sociaux.", keywords: ["meta", "instagram", "facebook", "linkedin", "tiktok", "youtube", "kdp"] },
  { id: "code", label: "Code & automatisation", description: "Depots, branches et automatisations techniques.", keywords: ["github", "git", "composio"] },
  { id: "other", label: "Autres liaisons", description: "Connecteurs disponibles sans famille specifique.", keywords: [] },
] as const;

// dry-dew-8fb3blacklace-publisher-relay is write-only (mission intake,
// rejects GET everywhere) — can't serve this page's read-only catalog
// either. See local-technique.tsx for the same fix + reasoning.
const OFFICIAL_API_BASE_URL = "https://blacklace-publisher-worker.benoitlubert.workers.dev";

function configuredApiBase(): string {
  return String(import.meta.env.VITE_API_BASE_URL || OFFICIAL_API_BASE_URL).trim().replace(/\/$/, "");
}

type ComposioProvider = {
  readonly id: string;
  readonly label: string;
  readonly capability: string;
  readonly status: "connected" | "authorization-required" | "available" | "not-configured";
  readonly connectedAccountId?: string | null;
  readonly remoteStatus?: string | null;
};

type ComposioCatalog = {
  readonly configured: boolean;
  readonly userId: string;
  readonly providers: readonly ComposioProvider[];
  readonly error?: string;
};

type ApiHealth = {
  readonly state: "checking" | "online" | "offline";
  readonly detail: string;
};

function apiUrl(path: string): string {
  const configured = configuredApiBase();
  const root = configured.endsWith("/api") ? configured : `${configured}/api`;
  return `${root}${path}`;
}

async function readJson(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch (_) {
    throw new Error(`Publisher ${response.status}: ${text.slice(0, 240)}`);
  }
}

function messageFrom(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try { return JSON.stringify(error); } catch (_) { return "Erreur inconnue"; }
}

function RealMockIndicator({ result }: { readonly result: ConnectorTestResult | undefined }) {
  if (!result) return null;
  const isError = !result.success || (!!result.error && !result.source);
  const dot = isError ? "bg-destructive" : result.isMock ? "bg-amber-500" : "bg-green-500";
  const label = isError ? "Erreur" : result.isMock ? "Mock" : "Reel";
  return <div className="flex items-center gap-1.5"><span className={`inline-block w-2 h-2 rounded-full ${dot}`} /><span className="font-mono text-[10px] uppercase text-muted-foreground">{label}</span></div>;
}

function providerStatusLabel(provider: ComposioProvider): string {
  if (provider.status === "connected") return "Connecte";
  if (provider.status === "authorization-required") return "Autorisation en attente";
  if (provider.status === "available") return "Disponible via Composio";
  return "Composio non configure";
}

function PublisherApiStatus() {
  const [health, setHealth] = useState<ApiHealth>({ state: "checking", detail: "Verification du serveur Publisher…" });
  const apiBase = configuredApiBase();

  async function check() {
    setHealth({ state: "checking", detail: "Verification du serveur Publisher…" });
    try {
      const response = await fetch(`${apiBase}/health`, { cache: "no-store" });
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}${text ? ` · ${text.slice(0, 120)}` : ""}`);
      setHealth({ state: "online", detail: "API Publisher joignable" });
    } catch (error) {
      setHealth({ state: "offline", detail: messageFrom(error) });
    }
  }

  useEffect(() => { void check(); }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Card className="border-border bg-card min-w-0">
        <CardContent className="p-4 flex items-start gap-3 min-w-0">
          <Server className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2"><p className="font-medium">API Publisher</p><Badge variant={health.state === "online" ? "default" : health.state === "offline" ? "destructive" : "outline"}>{health.state === "online" ? "En ligne" : health.state === "offline" ? "Hors ligne" : "Test…"}</Badge></div>
            <p className="text-xs text-muted-foreground break-all mt-1">{apiBase}</p>
            <p className="text-xs text-muted-foreground break-words mt-2">{health.detail}</p>
            <Button variant="outline" size="sm" className="mt-3 w-full sm:w-auto" onClick={() => void check()} disabled={health.state === "checking"}><RefreshCw className={`w-4 h-4 mr-2 ${health.state === "checking" ? "animate-spin" : ""}`} />Retester</Button>
          </div>
        </CardContent>
      </Card>
      <Card className="border-border bg-card min-w-0">
        <CardContent className="p-4 flex items-start gap-3 min-w-0">
          <Globe2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="min-w-0"><p className="font-medium">Interface Publisher</p><p className="text-xs text-muted-foreground break-all mt-1">{window.location.origin}</p><p className="text-xs text-muted-foreground mt-2">L’interface ne conserve aucune cle fournisseur. Elle interroge uniquement l’API Publisher.</p></div>
        </CardContent>
      </Card>
    </div>
  );
}

function ComposioLocalTechnique() {
  const { toast } = useToast();
  const [catalog, setCatalog] = useState<ComposioCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingProvider, setPendingProvider] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const refreshResponse = await fetch(apiUrl("/connectors/composio/refresh"), { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const refreshPayload = await readJson(refreshResponse);
      if (!refreshResponse.ok) throw new Error(refreshPayload?.error || `Publisher ${refreshResponse.status}`);
      const response = await fetch(apiUrl("/connectors/composio/catalog"));
      const payload = await readJson(response);
      if (!response.ok) throw new Error(payload?.error || `Publisher ${response.status}`);
      setCatalog(payload);
    } catch (error) {
      setCatalog({ configured: false, userId: "benoit-lubert", providers: [], error: messageFrom(error) });
    } finally {
      setLoading(false);
    }
  }

  async function connect(provider: ComposioProvider) {
    setPendingProvider(provider.id);
    try {
      const callbackUrl = `${window.location.origin}${window.location.pathname}?composio=return&provider=${encodeURIComponent(provider.id)}`;
      const response = await fetch(apiUrl("/connectors/composio/connect"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: provider.id, callbackUrl }) });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(payload?.error || `Publisher ${response.status}`);
      if (!payload?.redirectUrl) throw new Error("Composio n'a retourne aucune URL d'autorisation.");
      window.location.assign(payload.redirectUrl);
    } catch (error) {
      toast({ title: `Connexion ${provider.label} impossible`, description: messageFrom(error), variant: "destructive" });
      setPendingProvider(null);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("composio") === "return") {
      toast({ title: "Retour d’autorisation reçu", description: "Publisher vérifie maintenant le compte auprès de Composio." });
      window.history.replaceState({}, "", window.location.pathname);
    }
    void refresh();
  }, []);

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-xl font-serif font-semibold">Connexions du Local technique</h2><p className="text-sm text-muted-foreground">Autorisez ici les producteurs externes. Les cles restent cote Publisher sur Render.</p></div><Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading} className="w-full sm:w-auto"><RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Actualiser</Button></div>
      {loading ? <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{[...Array(5)].map((_, index) => <Skeleton key={index} className="h-40" />)}</div> : <>{catalog?.error && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive break-words">{catalog.error}</div>}{!catalog?.configured && <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-600">Le serveur Publisher ne confirme pas Composio. Verifiez <code>COMPOSIO_API_KEY</code> sur le service API Render.</div>}<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{(catalog?.providers ?? []).map((provider) => <Card key={provider.id} className="border-border bg-card"><CardHeader className="pb-2"><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-lg">{provider.label}</CardTitle><p className="font-mono text-[10px] uppercase text-muted-foreground mt-1">{provider.capability}</p></div><Badge variant={provider.status === "connected" ? "default" : "outline"}>{providerStatusLabel(provider)}</Badge></div></CardHeader><CardContent className="space-y-3"><p className="text-xs text-muted-foreground break-words">{provider.connectedAccountId ? `Compte : ${provider.connectedAccountId}` : "Aucun compte confirme par le serveur."}</p>{provider.status === "connected" ? <Button variant="outline" size="sm" disabled className="w-full">✓ Connecte</Button> : <Button size="sm" className="w-full" onClick={() => void connect(provider)} disabled={!catalog?.configured || pendingProvider === provider.id}><ExternalLink className="w-4 h-4 mr-2" />{pendingProvider === provider.id ? "Ouverture…" : "Connecter"}</Button>}</CardContent></Card>)}</div></>}
    </section>
  );
}

export default function Connectors() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [lastResults, setLastResults] = useState<Record<string, ConnectorTestResult>>({});
  const { data: connectors, isLoading } = useListConnectors({ query: { queryKey: getListConnectorsQueryKey() } });
  const testConnector = useTestConnector({ mutation: { onSuccess: (result, variables) => { queryClient.invalidateQueries({ queryKey: getListConnectorsQueryKey() }); setLastResults((prev) => ({ ...prev, [variables.name]: result })); toast({ title: result.success ? "Connexion etablie" : "Echec de connexion", description: result.message, variant: result.success ? "default" : "destructive" }); }, onError: (error) => toast({ title: "Erreur systeme", description: messageFrom(error), variant: "destructive" }) } });
  const groupedConnectors = CONNECTOR_FAMILIES.map((family) => ({ ...family, connectors: (connectors ?? []).filter((connector) => getConnectorFamilyId(connector) === family.id) })).filter((family) => family.connectors.length > 0);

  return <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-hidden"><div className="flex items-center justify-between"><div className="min-w-0"><h1 className="text-4xl font-serif font-bold text-foreground mb-2 tracking-tight break-words">Local technique</h1><p className="text-muted-foreground font-mono text-sm uppercase tracking-wider break-words">Connexions, autorisations et infrastructure Publisher</p></div></div><PublisherApiStatus /><ComposioLocalTechnique />{isLoading ? <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-64 w-full bg-secondary" />)}</div> : connectors?.length ? <div className="space-y-8">{groupedConnectors.map((family) => <section key={family.id} className="space-y-3 min-w-0"><div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div className="min-w-0"><h2 className="text-xl font-serif font-semibold text-foreground break-words">{family.label}</h2><p className="text-sm text-muted-foreground break-words">{family.description}</p></div><Badge variant="outline" className="w-fit font-mono text-[10px] uppercase">{family.connectors.length} liaison{family.connectors.length > 1 ? "s" : ""}</Badge></div><div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">{family.connectors.map((connector) => <Card key={connector.name} className="bg-card border-border hover:border-primary/30 transition-colors flex flex-col relative overflow-hidden group min-w-0"><div className={cn("absolute top-0 left-0 w-full h-1", connector.status === "connected" ? "bg-green-500/50" : connector.status === "error" ? "bg-destructive/50" : connector.status === "mock" ? "bg-amber-500/50" : "bg-muted")}></div><CardHeader className="pb-3"><div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start"><div className="flex items-start gap-3 min-w-0"><div className="p-2 bg-secondary rounded border border-border shrink-0"><Plug className="w-5 h-5 text-primary" /></div><div className="min-w-0"><CardTitle className="text-xl font-serif break-words">{connector.displayName}</CardTitle><div className="flex items-center gap-1.5 mt-1"><Activity className={cn("w-3 h-3 shrink-0", STATUS_COLORS[connector.status])} /><span className="font-mono text-[10px] uppercase text-muted-foreground break-words">{connector.status}</span></div></div></div><RealMockIndicator result={lastResults[connector.name]} /></div></CardHeader><CardContent className="flex-1 flex flex-col justify-between space-y-4 min-w-0"><p className="text-sm text-muted-foreground min-h-[40px] break-words">{connector.description || "Liaison de donnees non documentee."}</p>{lastResults[connector.name] && <div className="rounded-md border border-border bg-secondary/20 p-3 space-y-1 min-w-0 overflow-hidden"><p className="text-xs text-foreground font-mono break-words">{lastResults[connector.name].message}</p>{lastResults[connector.name].source && <p className="text-[11px] font-mono text-muted-foreground break-words">Source : {lastResults[connector.name].title ?? lastResults[connector.name].source}</p>}{lastResults[connector.name].error && <p className="text-[11px] font-mono text-destructive break-words">{lastResults[connector.name].error}</p>}</div>}<div className="space-y-3 pt-4 border-t border-border/50"><div className="flex items-center gap-1.5 text-muted-foreground font-mono text-[10px] uppercase tracking-wider"><Key className="w-3 h-3" /> Identifiants requis</div><div className="flex flex-wrap gap-2">{connector.requiredVars.map((variable) => <Badge key={variable} variant="outline" className="font-mono text-[10px] bg-secondary/30 max-w-full break-words">{variable}</Badge>)}</div></div><div className="pt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="text-[10px] font-mono text-muted-foreground flex items-center gap-1 min-w-0 break-words"><Clock className="w-3 h-3 shrink-0" />{connector.lastTestedAt ? format(parseISO(connector.lastTestedAt), "dd MMM yyyy HH:mm", { locale: fr }) : "Jamais teste"}</div><Button variant="outline" size="sm" className="w-full sm:w-auto font-mono text-xs border-primary/50 text-primary hover:bg-primary/20" onClick={() => testConnector.mutate({ name: connector.name })} disabled={testConnector.isPending}>{testConnector.isPending ? "Ping..." : "Ping"}</Button></div></CardContent></Card>)}</div></section>)}</div> : <div className="p-12 text-center border border-dashed border-border rounded-lg bg-card/50"><Plug className="w-8 h-8 text-muted-foreground mx-auto mb-4" /><h3 className="text-lg font-serif mb-2">Aucune liaison</h3><p className="text-muted-foreground font-mono text-sm">Le systeme est isole.</p></div>}</div>;
}

function getConnectorFamilyId(connector: { readonly name: string; readonly displayName: string; readonly description?: string | null }) {
  const haystack = `${connector.name} ${connector.displayName} ${connector.description ?? ""}`.toLowerCase();
  return CONNECTOR_FAMILIES.find((family) => family.id !== "other" && family.keywords.some((keyword) => haystack.includes(keyword)))?.id ?? "other";
}

function cn(...classes: (string | undefined | null | false)[]) { return classes.filter(Boolean).join(" "); }
