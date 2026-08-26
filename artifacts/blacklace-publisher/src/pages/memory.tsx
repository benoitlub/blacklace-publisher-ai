import { useEffect, useState } from "react";
import { BrainCircuit, CalendarClock, Database, RadioTower, RotateCcw, Tags, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ObservationDecision, ObservationMemoryEntry } from "@/models/observation-memory";
import { clearObservationMemory, loadObservationMemory, OBSERVATION_MEMORY_CHANGED_EVENT, updateObservationDecision } from "@/memory/observation-memory";
import { persistObservationDecision, syncObservationMemoryFromServer } from "@/memory/observation-sync";

const DECISION_LABELS: Record<ObservationDecision, string> = {
  watch: "A surveiller",
  ignore: "Ignorer",
  seed: "Creer un Seed",
  harvest: "Preparer un Harvest",
  article: "Preparer un article",
  compare: "Comparer",
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function priorityLabel(priority: NonNullable<ObservationMemoryEntry["octopus"]>["harvestPriority"]): string {
  if (priority === "prioritize") return "Prioritaire";
  if (priority === "prepare") return "À préparer";
  return "À observer";
}

function MemoryCard({ entry, onDecisionChange }: { entry: ObservationMemoryEntry; onDecisionChange: (id: string, decision: ObservationDecision) => void }) {
  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="font-serif text-2xl text-foreground">{entry.name}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{entry.lastSummary}</p>
          </div>
          <div className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 font-mono text-sm text-primary">
            {Math.round(entry.averageConfidence * 100)}%
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="font-mono text-[10px] uppercase">{entry.category}</Badge>
          <Badge variant="outline" className="font-mono text-[10px] uppercase">{entry.sourceKind}</Badge>
          <Badge variant="outline" className="font-mono text-[10px] uppercase">{entry.observationCount} observation(s)</Badge>
          {entry.octopus ? <Badge className="font-mono text-[10px] uppercase">octopus enrichi</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-secondary/20 p-3">
            <div className="mb-1 flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">
              <CalendarClock className="h-4 w-4 text-primary" />
              Premiere
            </div>
            <div className="font-serif text-lg text-foreground">{formatDate(entry.firstObservedAt)}</div>
          </div>
          <div className="rounded-lg border border-border bg-secondary/20 p-3">
            <div className="mb-1 flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">
              <RotateCcw className="h-4 w-4 text-primary" />
              Derniere
            </div>
            <div className="font-serif text-lg text-foreground">{formatDate(entry.lastObservedAt)}</div>
          </div>
          <label className="rounded-lg border border-border bg-secondary/20 p-3">
            <div className="mb-1 flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">
              <Target className="h-4 w-4 text-primary" />
              Decision
            </div>
            <select
              className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground"
              value={entry.currentDecision}
              onChange={(event) => onDecisionChange(entry.id, event.target.value as ObservationDecision)}
            >
              {Object.entries(DECISION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>

        {entry.octopus ? (
          <div className="rounded-lg border border-primary/30 bg-primary/10 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-primary">
                <RadioTower className="h-4 w-4" />
                Mémoire Octopus
              </div>
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                reçu {formatDate(entry.octopus.receivedAt)}
              </span>
            </div>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border border-border bg-background/60 p-3">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Pertinence</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{entry.octopus.relevanceScore}%</p>
              </div>
              <div className="rounded-md border border-border bg-background/60 p-3">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Nouveauté</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{entry.octopus.noveltyScore}%</p>
              </div>
              <div className="rounded-md border border-border bg-background/60 p-3">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Relations</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{entry.octopus.relatedCount}</p>
              </div>
              <div className="rounded-md border border-border bg-background/60 p-3">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Récolte</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{priorityLabel(entry.octopus.harvestPriority)}</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">{entry.octopus.summary}</p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-background/30 p-4 text-sm text-muted-foreground">
            Cette fiche précède le branchement de l’Observatoire à Octopus. Relance son observation pour obtenir pertinence, nouveauté, relations et priorité de récolte.
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-secondary/20 p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">
              <Tags className="h-4 w-4 text-primary" />
              Tags
            </div>
            <div className="flex flex-wrap gap-2">
              {entry.tags.slice(0, 10).map((tag) => (
                <Badge key={tag} className="bg-secondary text-secondary-foreground hover:bg-secondary">{tag}</Badge>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-secondary/20 p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">
              <BrainCircuit className="h-4 w-4 text-primary" />
              Comparables
            </div>
            {entry.comparableNames.length ? (
              <div className="flex flex-wrap gap-2">
                {entry.comparableNames.map((name) => (
                  <Badge key={name} variant="outline">{name}</Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aucun comparable local pour l'instant.</p>
            )}
          </div>
        </div>

        <div className="rounded-md border border-border bg-background p-3 text-xs text-muted-foreground break-all">
          {entry.sourceValue}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Memory() {
  const [entries, setEntries] = useState<ObservationMemoryEntry[]>([]);
  const [offline, setOffline] = useState(false);
  const [backfill, setBackfill] = useState<{ pushed: number; failed: number } | null>(null);

  useEffect(() => {
    const refresh = () => setEntries(loadObservationMemory());
    refresh();
    window.addEventListener(OBSERVATION_MEMORY_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    // Le localStorage n'est qu'un cache : la vérité est dans Neon, sinon
    // ces compteurs restent à 0 sur tout appareil autre que celui qui a
    // saisi la source.
    void syncObservationMemoryFromServer().then((synced) => {
      setOffline(synced === null);
      if (synced && (synced.pushed || synced.failed)) setBackfill({ pushed: synced.pushed, failed: synced.failed });
    });
    return () => {
      window.removeEventListener(OBSERVATION_MEMORY_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const onDecisionChange = (id: string, decision: ObservationDecision) => {
    // Optimiste côté cache, puis écriture serveur : c'est elle qui fait que
    // le job nocturne respecte la décision.
    updateObservationDecision(id, decision);
    setEntries(loadObservationMemory());
    void persistObservationDecision(id, decision)
      .then(() => {
        setEntries(loadObservationMemory());
        setOffline(false);
      })
      .catch(() => setOffline(true));
  };

  const onClear = () => {
    clearObservationMemory();
    setEntries([]);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge variant="outline" className="mb-3 font-mono uppercase tracking-widest">Memoire du Poulpe</Badge>
          <h1 className="text-4xl font-serif font-bold text-foreground tracking-tight">Mémoire</h1>
          <p className="mt-2 max-w-3xl text-sm font-mono uppercase tracking-wider text-muted-foreground">
            Observations retenues → historique → mémoire Octopus → décisions proposées
          </p>
        </div>
        {entries.length ? (
          <Button variant="outline" onClick={onClear}>Vider la memoire locale</Button>
        ) : null}
      </div>

      {offline ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-600">
          Base Neon injoignable : ces fiches viennent du cache de ce navigateur. Elles ne reflètent pas forcément ce que le job nocturne voit côté serveur.
        </div>
      ) : null}

      {backfill ? (
        <div className={backfill.failed ? "rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-600" : "rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary"}>
          {backfill.pushed ? `${backfill.pushed} fiche(s) qui n'existaient que dans ce navigateur ont été remontées en base — le job nocturne peut désormais les lire. ` : ""}
          {backfill.failed ? `${backfill.failed} fiche(s) locale(s) n'ont pas pu être remontées ; recharge la page pour réessayer.` : ""}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-mono uppercase tracking-widest text-muted-foreground">
              <Database className="h-4 w-4 text-primary" />
              Entrees
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-4xl font-serif text-primary">{entries.length}</div></CardContent>
        </Card>
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-mono uppercase tracking-widest text-muted-foreground">Observations</CardTitle>
          </CardHeader>
          <CardContent><div className="text-4xl font-serif text-foreground">{entries.reduce((sum, entry) => sum + entry.observationCount, 0)}</div></CardContent>
        </Card>
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-mono uppercase tracking-widest text-muted-foreground">Enrichies par Octopus</CardTitle>
          </CardHeader>
          <CardContent><div className="text-4xl font-serif text-foreground">{entries.filter((entry) => entry.octopus).length}</div></CardContent>
        </Card>
      </div>

      {entries.length ? (
        <div className="space-y-4">
          {entries.map((entry) => (
            <MemoryCard key={entry.id} entry={entry} onDecisionChange={onDecisionChange} />
          ))}
        </div>
      ) : (
        <Card className="border-dashed border-border bg-card/50">
          <CardContent className="flex flex-col items-center justify-center gap-3 p-10 text-center">
            <Database className="h-8 w-8 text-muted-foreground" />
            <p className="font-mono text-sm text-muted-foreground">Aucune source enregistree en base. Observe un candidat depuis le Radar ou l'Observatoire.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
