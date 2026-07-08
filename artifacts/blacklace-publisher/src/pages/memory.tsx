import { useEffect, useState } from "react";
import { BrainCircuit, CalendarClock, Database, RotateCcw, Tags, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ObservationDecision, ObservationMemoryEntry } from "@/models/observation-memory";
import { clearObservationMemory, loadObservationMemory, OBSERVATION_MEMORY_CHANGED_EVENT, updateObservationDecision } from "@/memory/observation-memory";

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

  useEffect(() => {
    const refresh = () => setEntries(loadObservationMemory());
    refresh();
    window.addEventListener(OBSERVATION_MEMORY_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(OBSERVATION_MEMORY_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const onDecisionChange = (id: string, decision: ObservationDecision) => {
    updateObservationDecision(id, decision);
    setEntries(loadObservationMemory());
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
            Observations retenues → historique → comparables → decisions proposees
          </p>
        </div>
        {entries.length ? (
          <Button variant="outline" onClick={onClear}>Vider la memoire locale</Button>
        ) : null}
      </div>

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
            <CardTitle className="text-sm font-mono uppercase tracking-widest text-muted-foreground">Mode</CardTitle>
          </CardHeader>
          <CardContent><div className="text-lg font-serif text-foreground">LocalStorage</div></CardContent>
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
            <p className="font-mono text-sm text-muted-foreground">Aucune observation memorisee. Observe un candidat depuis le Radar ou l'Observatoire.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
