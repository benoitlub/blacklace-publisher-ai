import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ExternalLink, KeyRound, LockKeyhole, RefreshCw, Server, ShieldCheck } from "lucide-react";

const OFFICIAL_API_BASE_URL = "https://dry-dew-8fb3blacklace-publisher-relay.benoitlubert.workers.dev";

function apiBase() {
  return String(import.meta.env.VITE_API_BASE_URL || OFFICIAL_API_BASE_URL).trim().replace(/\/$/, "");
}

function apiUrl(path: string) {
  const base = apiBase();
  return `${base.endsWith("/api") ? base : `${base}/api`}${path}`;
}

type Provider = {
  id: string;
  label: string;
  capability: string;
  status: "connected" | "authorization-required" | "available" | "not-configured";
  connectedAccountId?: string | null;
};

type Catalog = {
  configured: boolean;
  userId: string;
  providers: Provider[];
  error?: string;
};

type Diagnostics = {
  mistral?: { configured?: boolean; available?: boolean };
  composio?: { configured?: boolean };
  canva?: { connected?: boolean };
  elevenLabs?: { connected?: boolean };
};

function statusLabel(status: Provider["status"]) {
  if (status === "connected") return "Connecté";
  if (status === "authorization-required") return "Autorisation requise";
  if (status === "available") return "Prêt à connecter";
  return "Indisponible";
}

export default function LocalTechnique() {
  const { toast } = useToast();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);

  async function readJson(response: Response) {
    const text = await response.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch { throw new Error(`Réponse serveur illisible (${response.status})`); }
  }

  async function refresh() {
    setLoading(true);
    try {
      const [catalogResponse, diagnosticsResponse] = await Promise.all([
        fetch(apiUrl("/connectors/composio/catalog"), { cache: "no-store" }),
        fetch(apiUrl("/production/diagnostics"), { cache: "no-store" }),
      ]);
      const nextCatalog = await readJson(catalogResponse);
      const nextDiagnostics = await readJson(diagnosticsResponse);
      setCatalog(catalogResponse.ok ? nextCatalog : { configured: false, userId: "", providers: [], error: nextCatalog?.error || `Erreur ${catalogResponse.status}` });
      setDiagnostics(diagnosticsResponse.ok ? nextDiagnostics : null);
    } catch (error) {
      setCatalog({ configured: false, userId: "", providers: [], error: error instanceof Error ? error.message : "Erreur inconnue" });
      setDiagnostics(null);
    } finally {
      setLoading(false);
    }
  }

  async function connect(provider: Provider) {
    setPending(provider.id);
    try {
      const callbackUrl = `${window.location.origin}/local-technique?composio=return&provider=${encodeURIComponent(provider.id)}`;
      const response = await fetch(apiUrl("/connectors/composio/connect"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: provider.id, callbackUrl }),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(payload?.error || `Connexion impossible (${response.status})`);
      if (!payload?.redirectUrl) throw new Error("Aucune page d’autorisation n’a été retournée.");
      window.location.assign(payload.redirectUrl);
    } catch (error) {
      toast({
        title: `Connexion ${provider.label} impossible`,
        description: error instanceof Error ? error.message : "Erreur inconnue",
        variant: "destructive",
      });
      setPending(null);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("composio") === "return") {
      toast({ title: "Autorisation reçue", description: "Le Local technique vérifie maintenant la connexion." });
      window.history.replaceState({}, "", "/local-technique");
    }
    void refresh();
  }, []);

  const infrastructure = useMemo(() => [
    { label: "Mistral", ready: Boolean(diagnostics?.mistral?.configured), detail: "Génération côté serveur" },
    { label: "Composio", ready: Boolean(diagnostics?.composio?.configured ?? catalog?.configured), detail: "OAuth et comptes externes" },
    { label: "Canva", ready: Boolean(diagnostics?.canva?.connected), detail: "Production visuelle" },
    { label: "ElevenLabs", ready: Boolean(diagnostics?.elevenLabs?.connected), detail: "Voix et audio" },
  ], [diagnostics, catalog]);

  return (
    <div className="space-y-7 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="space-y-2">
        <Badge variant="outline" className="gap-2"><ShieldCheck className="h-3.5 w-3.5" />Administration</Badge>
        <h1 className="text-3xl font-serif font-bold tracking-tight sm:text-4xl">Local technique</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Connectez ici les services utilisés par Publisher, Poulpe Fiction et les applications. Octopus Engine reçoit seulement des capacités autorisées, jamais les clés elles-mêmes.
        </p>
      </header>

      <Card className="border-primary/25 bg-card">
        <CardHeader><CardTitle className="flex items-center gap-2"><LockKeyhole className="h-5 w-5 text-primary" />Séparation des accès</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-background/40 p-4">
            <p className="font-medium">Comptes client</p>
            <p className="mt-1 text-sm text-muted-foreground">Connexion par OAuth : aucune clé n’est copiée dans le navigateur. Un client peut autoriser uniquement ses propres comptes.</p>
          </div>
          <div className="rounded-lg border border-border bg-background/40 p-4">
            <p className="font-medium">Secrets administrateur</p>
            <p className="mt-1 text-sm text-muted-foreground">Les clés maîtresses restent dans les secrets du serveur Render. Cette page montre leur état sans jamais révéler leur valeur.</p>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="text-xl font-serif font-semibold">État de l’infrastructure</h2><p className="text-sm text-muted-foreground">Diagnostic honnête, sans exposition de secret.</p></div>
          <Button variant="outline" onClick={() => void refresh()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Actualiser</Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {infrastructure.map((item) => (
            <Card key={item.label} className="bg-card"><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><Server className="h-5 w-5 text-primary" /><Badge variant={item.ready ? "default" : "outline"}>{item.ready ? "Disponible" : "À configurer"}</Badge></div><p className="mt-3 font-medium">{item.label}</p><p className="mt-1 text-xs text-muted-foreground">{item.detail}</p></CardContent></Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div><h2 className="text-xl font-serif font-semibold">Connexions autorisables</h2><p className="text-sm text-muted-foreground">Les boutons ouvrent le véritable flux d’autorisation du service.</p></div>
        {catalog?.error ? <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{catalog.error}</div> : null}
        {!loading && !catalog?.configured ? <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-600">Le serveur doit d’abord disposer de sa clé Composio maîtresse. Elle reste réservée à l’administrateur.</div> : null}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(catalog?.providers ?? []).map((provider) => (
            <Card key={provider.id} className="bg-card">
              <CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-lg">{provider.label}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{provider.capability}</p></div><Badge variant={provider.status === "connected" ? "default" : "outline"}>{statusLabel(provider.status)}</Badge></div></CardHeader>
              <CardContent className="space-y-3"><p className="text-xs text-muted-foreground">{provider.connectedAccountId ? "Compte autorisé et confirmé par le serveur." : "Aucun compte autorisé pour cet espace."}</p>{provider.status === "connected" ? <Button variant="outline" disabled className="w-full">Connecté</Button> : <Button className="w-full" onClick={() => void connect(provider)} disabled={!catalog?.configured || pending === provider.id}><ExternalLink className="mr-2 h-4 w-4" />{pending === provider.id ? "Ouverture…" : "Connecter le compte"}</Button>}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Card className="border-dashed bg-card/50">
        <CardContent className="flex items-start gap-3 p-4"><KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="font-medium">Ce qui n’est pas simulé</p><p className="mt-1 text-sm text-muted-foreground">Une connexion est affichée comme active uniquement lorsque le serveur la confirme. Les noms techniques de variables ne sont plus présentés comme un formulaire client.</p></div></CardContent>
      </Card>
    </div>
  );
}
