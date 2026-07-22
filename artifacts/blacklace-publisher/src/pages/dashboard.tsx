import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KnowledgeSourceStatus } from "@/components/knowledge-source-status";
import { ActivityEcho } from "@/components/activity-echo";
import { toActivityEchoEvents } from "@/lib/activity-echo-events";
import { loadActivityEntries, PUBLISHER_LOOP_CHANGED_EVENT, type ActivityEntry } from "@/lib/missions";
import { Activity, Ear, Eye, PackageCheck, Radio, RefreshCw, Send, Sparkles, Sprout } from "lucide-react";

const CAPTURE_TYPES = new Set<string>(["radar-launched", "candidate-detected", "observation-memorized", "seed-created"]);
const PREPARED_TYPES = new Set<string>(["knowledge-pack-created", "harvest-draft-created", "publication-draft-generated", "publication-draft-updated"]);
const TRANSMITTED_TYPES = new Set<string>(["mission-sent", "provider-call-started", "recommendation-applied", "test-in-progress", "fallback-used", "blockage-detected"]);
const API_BASE = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

type PoulpeSeed = { id: string; parcelId?: string; title?: string; status?: string; maturity?: number; lastCultivatedAt?: string };
type PoulpeParcel = { id: string; name?: string; title?: string };
type PoulpeEvent = { id: string; label?: string; createdAt?: string };
type PoulpeLifeState = { parcels: PoulpeParcel[]; seeds: PoulpeSeed[]; events: PoulpeEvent[] };

function latestOf(entries: readonly ActivityEntry[], accepted: ReadonlySet<string>): ActivityEntry | undefined {
  return entries.find((entry) => accepted.has(String(entry.type)));
}

function SignalCard({ title, empty, entry, icon: Icon }: { title: string; empty: string; entry?: ActivityEntry; icon: typeof Eye }) {
  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 font-serif text-lg"><Icon className="h-5 w-5 text-primary" />{title}</CardTitle></CardHeader>
      <CardContent>{entry ? <div className="space-y-2"><p className="font-medium text-foreground">{entry.label}</p>{entry.detail ? <p className="text-sm text-muted-foreground">{entry.detail}</p> : null}<Badge variant="outline" className="font-mono text-[10px] uppercase">{entry.type}</Badge></div> : <p className="text-sm text-muted-foreground">{empty}</p>}</CardContent>
    </Card>
  );
}

function GerardGardenTile() {
  const [life, setLife] = useState<PoulpeLifeState | null>(null);
  const [error, setError] = useState<string | null>(API_BASE ? null : "Aucune API Publisher n’est configurée. Render n’est pas utilisé par défaut.");
  const [loading, setLoading] = useState(Boolean(API_BASE));

  const refresh = async () => {
    if (!API_BASE) return;
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/poulpe-life/state`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Publisher API ${response.status}`);
      const payload = await response.json() as Partial<PoulpeLifeState>;
      setLife({ parcels: Array.isArray(payload.parcels) ? payload.parcels : [], seeds: Array.isArray(payload.seeds) ? payload.seeds : [], events: Array.isArray(payload.events) ? payload.events : [] });
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Vie du jardin indisponible");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!API_BASE) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const summary = useMemo(() => {
    const seeds = life?.seeds ?? [];
    const active = seeds.filter((seed) => ["observing", "growing"].includes(String(seed.status))).length;
    const ready = seeds.filter((seed) => seed.status === "bag-ready").length;
    const missions = seeds.filter((seed) => seed.status === "adventure").length;
    const average = seeds.length ? Math.round((seeds.reduce((total, seed) => total + Number(seed.maturity || 0), 0) / seeds.length) * 10) / 10 : 0;
    return { active, ready, missions, average };
  }, [life]);

  const latestEvent = life?.events?.[0];

  return (
    <Card className="overflow-hidden border-primary/30 bg-card shadow-sm">
      <CardHeader className="gap-3 border-b border-border bg-primary/5 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div><CardTitle className="flex items-center gap-2 font-serif text-xl"><Sprout className="h-5 w-5 text-primary" />Gérard travaille sur toutes les parcelles</CardTitle><p className="mt-1 text-sm text-muted-foreground">Vue Publisher de la culture persistante. Gérard répartit ses tentacules sans changer manuellement de parcelle.</p></div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => void refresh()} disabled={loading || !API_BASE}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Actualiser</Button>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        {error ? <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg border border-border bg-background/50 p-3"><p className="text-xs uppercase text-muted-foreground">Parcelles</p><p className="mt-1 text-2xl font-semibold">{life?.parcels.length ?? "—"}</p></div>
          <div className="rounded-lg border border-border bg-background/50 p-3"><p className="text-xs uppercase text-muted-foreground">Seeds</p><p className="mt-1 text-2xl font-semibold">{life?.seeds.length ?? "—"}</p></div>
          <div className="rounded-lg border border-border bg-background/50 p-3"><p className="text-xs uppercase text-muted-foreground">En pousse</p><p className="mt-1 text-2xl font-semibold">{life ? summary.active : "—"}</p></div>
          <div className="rounded-lg border border-border bg-background/50 p-3"><p className="text-xs uppercase text-muted-foreground">Sacs prêts</p><p className="mt-1 text-2xl font-semibold">{life ? summary.ready : "—"}</p></div>
          <div className="rounded-lg border border-border bg-background/50 p-3"><p className="text-xs uppercase text-muted-foreground">Maturité moyenne</p><p className="mt-1 text-2xl font-semibold">{life ? `${summary.average}%` : "—"}</p></div>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-lg border border-border p-3"><p className="flex items-center gap-2 text-sm font-medium"><Activity className="h-4 w-4 text-primary" />Activité parallèle</p><p className="mt-2 text-sm text-muted-foreground">{summary.active} Seed(s) en observation ou croissance, {summary.missions} en aventure.</p></div>
          <div className="rounded-lg border border-border p-3"><p className="flex items-center gap-2 text-sm font-medium"><PackageCheck className="h-4 w-4 text-primary" />Récoltes à autoriser</p><p className="mt-2 text-sm text-muted-foreground">{summary.ready} sac(s) prêt(s) attendent un départ ou une validation humaine.</p></div>
          <div className="rounded-lg border border-border p-3"><p className="flex items-center gap-2 text-sm font-medium"><Sprout className="h-4 w-4 text-primary" />Dernière trace réelle</p><p className="mt-2 text-sm text-muted-foreground">{latestEvent?.label || (loading ? "Lecture du jardin…" : "Aucun événement enregistré.")}</p></div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [activityEntries, setActivityEntries] = useState<ActivityEntry[]>([]);
  useEffect(() => {
    const refreshActivity = () => setActivityEntries(loadActivityEntries());
    refreshActivity();
    window.addEventListener(PUBLISHER_LOOP_CHANGED_EVENT, refreshActivity);
    window.addEventListener("storage", refreshActivity);
    return () => { window.removeEventListener(PUBLISHER_LOOP_CHANGED_EVENT, refreshActivity); window.removeEventListener("storage", refreshActivity); };
  }, []);

  const signals = useMemo(() => ({ captured: latestOf(activityEntries, CAPTURE_TYPES), prepared: latestOf(activityEntries, PREPARED_TYPES), transmitted: latestOf(activityEntries, TRANSMITTED_TYPES) }), [activityEntries]);

  return (
    <div className="space-y-7 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><Badge variant="outline" className="mb-3 gap-2 font-mono uppercase tracking-widest"><Eye className="h-3.5 w-3.5" /> Yeux et oreilles</Badge><h1 className="text-4xl font-serif font-bold tracking-tight text-foreground">Publisher observe le monde.</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Il capte les signaux, en extrait ce qui mérite l’attention et prépare des ressources pour Octopus Engine.</p></div>
        <div className="flex flex-wrap gap-2"><Link href="/radar"><Button variant="outline" className="gap-2"><Radio className="h-4 w-4" />Radar</Button></Link><Link href="/observatory"><Button className="gap-2"><Sparkles className="h-4 w-4" />Observatoire</Button></Link></div>
      </header>
      <KnowledgeSourceStatus />
      <section className="grid gap-4 lg:grid-cols-3" aria-label="Résumé des observations Publisher">
        <SignalCard title="Ce qu’il vient de voir" empty="Aucun signal nouveau n’a encore été retenu." entry={signals.captured} icon={Eye} />
        <SignalCard title="Ce qu’il vient d’entendre" empty="Aucune connaissance ou comparaison n’est encore prête." entry={signals.prepared} icon={Ear} />
        <SignalCard title="Ce qu’il transmet au moteur" empty="Rien n’attend Octopus Engine pour le moment." entry={signals.transmitted} icon={Send} />
      </section>
      <GerardGardenTile />
      <section className="space-y-3"><div className="flex items-end justify-between gap-3 border-b border-border pb-2"><div><h2 className="font-serif text-xl font-semibold">Écho de l’observation</h2><p className="text-xs text-muted-foreground">Uniquement les événements réellement enregistrés.</p></div><Badge variant="outline">{activityEntries.length} trace{activityEntries.length > 1 ? "s" : ""}</Badge></div><ActivityEcho events={toActivityEchoEvents(activityEntries.slice(0, 8))} emptyMessage="Publisher écoute. Aucun signal utile n’est encore remonté." /></section>
    </div>
  );
}
