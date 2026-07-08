import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GreenhouseCluster, GreenhouseMaturity } from "@/models/greenhouse";
import type { ObservationMemoryEntry } from "@/models/observation-memory";
import { buildGreenhouse } from "@/knowledge/build-greenhouse";
import { loadObservationMemory, OBSERVATION_MEMORY_CHANGED_EVENT } from "@/memory/observation-memory";
import { Sprout, Flower2, TreePine, Leaf, Database, CalendarClock } from "lucide-react";

const MATURITY_ICON: Record<GreenhouseMaturity, typeof Sprout> = {
  graine: Sprout,
  pousse: Leaf,
  plante: Flower2,
  arbre: TreePine,
};

const MATURITY_LABEL: Record<GreenhouseMaturity, string> = {
  graine: "Graine",
  pousse: "Pousse",
  plante: "Plante",
  arbre: "Arbre",
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function ToolLine({ entry }: { entry: ObservationMemoryEntry }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="font-serif text-lg text-foreground">{entry.name}</div>
          <p className="mt-1 text-xs text-muted-foreground">{entry.lastSummary}</p>
        </div>
        <Badge variant="outline" className="w-fit font-mono text-[10px] uppercase">
          {Math.round(entry.averageConfidence * 100)}%
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant="outline" className="font-mono text-[10px] uppercase">{entry.category}</Badge>
        <Badge variant="outline" className="font-mono text-[10px] uppercase">{entry.observationCount} obs.</Badge>
        <Badge variant="outline" className="font-mono text-[10px] uppercase">{entry.currentDecision}</Badge>
      </div>
    </div>
  );
}

function ClusterCard({ cluster }: { cluster: GreenhouseCluster }) {
  const Icon = MATURITY_ICON[cluster.maturity];

  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 font-serif text-2xl text-foreground">
              <Icon className="h-5 w-5 text-primary" />
              {cluster.title}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{cluster.dominantCategory}</p>
          </div>
          <div className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 font-mono text-sm text-primary">
            {MATURITY_LABEL[cluster.maturity]}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="font-mono text-[10px] uppercase">{cluster.toolCount} outil(s)</Badge>
          <Badge variant="outline" className="font-mono text-[10px] uppercase">{cluster.observationCount} observation(s)</Badge>
          <Badge variant="outline" className="font-mono text-[10px] uppercase">confiance {Math.round(cluster.averageConfidence * 100)}%</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-secondary/20 p-3">
            <div className="mb-1 flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">
              <CalendarClock className="h-4 w-4 text-primary" />
              Première pousse
            </div>
            <div className="font-serif text-lg text-foreground">{formatDate(cluster.firstObservedAt)}</div>
          </div>
          <div className="rounded-lg border border-border bg-secondary/20 p-3">
            <div className="mb-1 flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">
              <CalendarClock className="h-4 w-4 text-primary" />
              Dernier signal
            </div>
            <div className="font-serif text-lg text-foreground">{formatDate(cluster.lastObservedAt)}</div>
          </div>
        </div>

        {cluster.sharedTags.length ? (
          <div className="rounded-lg border border-border bg-secondary/20 p-4">
            <div className="mb-3 text-xs font-mono uppercase tracking-widest text-muted-foreground">Tags communs</div>
            <div className="flex flex-wrap gap-2">
              {cluster.sharedTags.map((tag) => (
                <Badge key={tag} className="bg-secondary text-secondary-foreground hover:bg-secondary">{tag}</Badge>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-lg border border-border bg-secondary/20 p-4">
          <div className="mb-3 text-xs font-mono uppercase tracking-widest text-muted-foreground">Signaux de serre</div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {cluster.signals.map((signal) => (
              <li key={signal} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{signal}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Outils dans cette serre</div>
          {cluster.entries.map((entry) => (
            <ToolLine key={entry.id} entry={entry} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Greenhouse() {
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

  const report = useMemo(() => buildGreenhouse(entries), [entries]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge variant="outline" className="mb-3 font-mono uppercase tracking-widest">Serre du Poulpe</Badge>
          <h1 className="text-4xl font-serif font-bold text-foreground tracking-tight">Serre</h1>
          <p className="mt-2 max-w-3xl text-sm font-mono uppercase tracking-wider text-muted-foreground">
            Observations → groupes vivants → maturité → Seeds potentiels
          </p>
        </div>
        <Button variant="outline" disabled>{report.clusters.length} serre(s)</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-mono uppercase tracking-widest text-muted-foreground">
              <Database className="h-4 w-4 text-primary" />
              Outils
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-4xl font-serif text-primary">{report.totalEntries}</div></CardContent>
        </Card>
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-mono uppercase tracking-widest text-muted-foreground">Observations</CardTitle>
          </CardHeader>
          <CardContent><div className="text-4xl font-serif text-foreground">{report.totalObservations}</div></CardContent>
        </Card>
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-mono uppercase tracking-widest text-muted-foreground">Mode</CardTitle>
          </CardHeader>
          <CardContent><div className="text-lg font-serif text-foreground">Local / sans IA</div></CardContent>
        </Card>
      </div>

      {report.clusters.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {report.clusters.map((cluster) => (
            <ClusterCard key={cluster.id} cluster={cluster} />
          ))}
        </div>
      ) : (
        <Card className="border-dashed border-border bg-card/50">
          <CardContent className="flex flex-col items-center justify-center gap-3 p-10 text-center">
            <Sprout className="h-8 w-8 text-muted-foreground" />
            <p className="font-mono text-sm text-muted-foreground">La serre est vide. Observe quelques candidats pour faire pousser les premiers groupes.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
