import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KnowledgeSourceStatus } from "@/components/knowledge-source-status";
import { ActivityEcho } from "@/components/activity-echo";
import { toActivityEchoEvents } from "@/lib/activity-echo-events";
import { loadActivityEntries, PUBLISHER_LOOP_CHANGED_EVENT, type ActivityEntry } from "@/lib/missions";
import { Ear, Eye, Radio, Send, Sparkles } from "lucide-react";

const CAPTURE_TYPES = new Set<string>(["radar-launched", "candidate-detected", "observation-memorized", "seed-created"]);
const PREPARED_TYPES = new Set<string>(["knowledge-pack-created", "harvest-draft-created", "publication-draft-generated", "publication-draft-updated"]);
const TRANSMITTED_TYPES = new Set<string>(["mission-sent", "provider-call-started", "recommendation-applied", "test-in-progress", "fallback-used", "blockage-detected"]);

function latestOf(entries: readonly ActivityEntry[], accepted: ReadonlySet<string>): ActivityEntry | undefined {
  return entries.find((entry) => accepted.has(String(entry.type)));
}

function SignalCard({ title, empty, entry, icon: Icon }: { title: string; empty: string; entry?: ActivityEntry; icon: typeof Eye }) {
  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-serif text-lg">
          <Icon className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entry ? (
          <div className="space-y-2">
            <p className="font-medium text-foreground">{entry.label}</p>
            {entry.detail ? <p className="text-sm text-muted-foreground">{entry.detail}</p> : null}
            <Badge variant="outline" className="font-mono text-[10px] uppercase">{entry.type}</Badge>
          </div>
        ) : <p className="text-sm text-muted-foreground">{empty}</p>}
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
    return () => {
      window.removeEventListener(PUBLISHER_LOOP_CHANGED_EVENT, refreshActivity);
      window.removeEventListener("storage", refreshActivity);
    };
  }, []);

  const signals = useMemo(() => ({
    captured: latestOf(activityEntries, CAPTURE_TYPES),
    prepared: latestOf(activityEntries, PREPARED_TYPES),
    transmitted: latestOf(activityEntries, TRANSMITTED_TYPES),
  }), [activityEntries]);

  return (
    <div className="space-y-7 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge variant="outline" className="mb-3 gap-2 font-mono uppercase tracking-widest">
            <Eye className="h-3.5 w-3.5" /> Yeux et oreilles
          </Badge>
          <h1 className="text-4xl font-serif font-bold tracking-tight text-foreground">Publisher observe le monde.</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Il capte les signaux, en extrait ce qui mérite l’attention et prépare des ressources pour Octopus Engine.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/radar"><Button variant="outline" className="gap-2"><Radio className="h-4 w-4" />Radar</Button></Link>
          <Link href="/observatory"><Button className="gap-2"><Sparkles className="h-4 w-4" />Observatoire</Button></Link>
        </div>
      </header>

      <KnowledgeSourceStatus />

      <section className="grid gap-4 lg:grid-cols-3" aria-label="Résumé des observations Publisher">
        <SignalCard title="Ce qu’il vient de voir" empty="Aucun signal nouveau n’a encore été retenu." entry={signals.captured} icon={Eye} />
        <SignalCard title="Ce qu’il vient d’entendre" empty="Aucune connaissance ou comparaison n’est encore prête." entry={signals.prepared} icon={Ear} />
        <SignalCard title="Ce qu’il transmet au moteur" empty="Rien n’attend Octopus Engine pour le moment." entry={signals.transmitted} icon={Send} />
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3 border-b border-border pb-2">
          <div>
            <h2 className="font-serif text-xl font-semibold">Écho de l’observation</h2>
            <p className="text-xs text-muted-foreground">Uniquement les événements réellement enregistrés.</p>
          </div>
          <Badge variant="outline">{activityEntries.length} trace{activityEntries.length > 1 ? "s" : ""}</Badge>
        </div>
        <ActivityEcho events={toActivityEchoEvents(activityEntries.slice(0, 8))} emptyMessage="Publisher écoute. Aucun signal utile n’est encore remonté." />
      </section>

      <div className="rounded-xl border border-dashed border-border bg-card/40 p-4 text-sm text-muted-foreground">
        Le Garden, Gérard et ses parcelles restent dans Poulpe Fiction. Les clés, fournisseurs et autorisations restent dans le Local technique.
      </div>
    </div>
  );
}
