import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ObservationMemoryEntry } from "@/models/observation-memory";
import { buildGreenhouse } from "@/knowledge/build-greenhouse";
import { loadObservationMemory, OBSERVATION_MEMORY_CHANGED_EVENT } from "@/memory/observation-memory";
import { syncObservationMemoryFromServer } from "@/memory/observation-sync";
import { Ear, Eye, Send, Sprout } from "lucide-react";

function formatDate(value?: string): string {
  if (!value) return "Aucun signal";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function SignalCard({
  title,
  value,
  detail,
  icon: Icon,
}: {
  title: string;
  value: string;
  detail: string;
  icon: typeof Eye;
}) {
  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-serif text-lg">
          <Icon className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-base font-medium text-foreground">{value}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{detail}</p>
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
    // Recharge depuis Neon : sans ça, la serre ne montrerait que ce que ce
    // navigateur a lui-même observé.
    void syncObservationMemoryFromServer();
    return () => {
      window.removeEventListener(OBSERVATION_MEMORY_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const report = useMemo(() => buildGreenhouse(entries), [entries]);
  const latest = entries
    .slice()
    .sort((a, b) => new Date(b.lastObservedAt).getTime() - new Date(a.lastObservedAt).getTime())[0];
  const strongest = report.clusters
    .slice()
    .sort((a, b) => b.averageConfidence - a.averageConfidence)[0];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header>
        <Badge variant="outline" className="mb-3 gap-2 font-mono uppercase tracking-widest">
          <Eye className="h-3.5 w-3.5" />
          Yeux et oreilles
        </Badge>
        <h1 className="text-3xl font-serif font-bold tracking-tight text-foreground sm:text-4xl">
          Publisher observe le monde.
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Il repère les signaux, écoute ce qui revient, puis prépare ce qui mérite d’être transmis à Octopus Engine.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3" aria-label="Résumé Publisher">
        <SignalCard
          title="Ce qu’il vient de voir"
          value={latest?.name || "Rien de nouveau"}
          detail={latest ? `${latest.lastSummary} · ${formatDate(latest.lastObservedAt)}` : "Publisher continue d’observer sans fabriquer de faux signal."}
          icon={Eye}
        />
        <SignalCard
          title="Ce qu’il vient d’entendre"
          value={strongest?.title || "Aucun motif confirmé"}
          detail={strongest ? `${strongest.observationCount} observation(s), confiance ${Math.round(strongest.averageConfidence * 100)}%.` : "Les observations ne forment pas encore un motif assez solide."}
          icon={Ear}
        />
        <SignalCard
          title="Ce qu’il peut transmettre"
          value={strongest ? "Une ressource est prête à être examinée" : "Rien à transmettre"}
          detail={strongest ? "Octopus Engine peut maintenant décider si ce signal mérite une action." : "Publisher garde le silence tant qu’il n’a rien d’utile à envoyer."}
          icon={Send}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
          <div>
            <h2 className="font-serif text-xl font-semibold">Signaux retenus</h2>
            <p className="text-xs text-muted-foreground">Les observations réelles déjà mémorisées.</p>
          </div>
          <Badge variant="outline">{entries.length}</Badge>
        </div>

        {entries.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {entries.slice(0, 6).map((entry) => (
              <Card key={entry.id} className="border-border bg-card/80">
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{entry.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{entry.lastSummary}</p>
                    </div>
                    <Badge variant="outline" className="shrink-0 font-mono text-[10px] uppercase">
                      {Math.round(entry.averageConfidence * 100)}%
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Dernier signal : {formatDate(entry.lastObservedAt)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-dashed border-border bg-card/50">
            <CardContent className="flex flex-col items-center justify-center gap-3 p-10 text-center">
              <Sprout className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Aucun signal utile n’est encore remonté. Publisher écoute.</p>
            </CardContent>
          </Card>
        )}
      </section>

      <p className="rounded-xl border border-dashed border-border bg-card/40 p-4 text-sm text-muted-foreground">
        Publisher ne jardine pas. Le Garden et Gérard restent dans Poulpe Fiction ; Publisher voit, entend et transmet.
      </p>
    </div>
  );
}
