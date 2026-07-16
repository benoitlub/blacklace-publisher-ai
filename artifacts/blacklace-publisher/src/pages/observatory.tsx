import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, BrainCircuit, CheckCircle2, Clipboard, Database, FlaskConical, Loader2, PackageCheck, RadioTower, Send, Telescope } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { KnowledgeObservatoryResult, SourceKind } from "@/models/knowledge-observatory";
import { runKnowledgeObservatory } from "@/services/knowledge-observatory";
import { sendObservatoryObservation, type PublisherOctopusObservationResult } from "@/services/octopus-observation";
import { rememberObservation } from "@/memory/observation-memory";

const SOURCE_KINDS: Array<{ value: SourceKind; label: string }> = [
  { value: "url", label: "URL" },
  { value: "github", label: "Depot GitHub" },
  { value: "text", label: "Texte" },
  { value: "markdown", label: "Markdown" },
  { value: "pdf", label: "PDF placeholder" },
];

const DEFAULT_SOURCE = "Lovable est un outil de creation d'applications web a partir de prompts. Il combine generation UI, composants React, publication rapide et iteration produit.";

function getInitialSource(): { kind: SourceKind; value: string } {
  if (typeof window === "undefined") return { kind: "text", value: DEFAULT_SOURCE };
  const params = new URLSearchParams(window.location.search);
  const rawKind = params.get("kind") as SourceKind | null;
  const value = params.get("value") || DEFAULT_SOURCE;
  const kind = SOURCE_KINDS.some((sourceKind) => sourceKind.value === rawKind) ? rawKind! : "text";
  return { kind, value };
}

function StepCard({ icon: Icon, title, children, done = true }: { icon: typeof Telescope; title: string; children: ReactNode; done?: boolean }) {
  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-mono uppercase tracking-widest text-muted-foreground">
          <Icon className={done ? "h-4 w-4 text-primary" : "h-4 w-4"} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">{children}</CardContent>
    </Card>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/20 p-4">
      <h3 className="mb-3 font-serif text-base font-semibold text-foreground">{title}</h3>
      <ul className="space-y-2 text-sm text-muted-foreground">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function priorityLabel(priority: PublisherOctopusObservationResult["publisher"]["harvestPriority"]) {
  if (priority === "prioritize") return "Prioritaire";
  if (priority === "prepare") return "À préparer";
  return "À observer";
}

export default function Observatory() {
  const initialSource = getInitialSource();
  const [kind, setKind] = useState<SourceKind>(initialSource.kind);
  const [value, setValue] = useState(initialSource.value);
  const [result, setResult] = useState<KnowledgeObservatoryResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [remembered, setRemembered] = useState(false);
  const [octopusResult, setOctopusResult] = useState<PublisherOctopusObservationResult | null>(null);
  const [octopusError, setOctopusError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const packJson = useMemo(() => (result ? JSON.stringify(result.pack, null, 2) : ""), [result]);

  const runAnalysis = async () => {
    const safeValue = value.trim() || DEFAULT_SOURCE;
    const nextResult = runKnowledgeObservatory({ kind, value: safeValue });
    rememberObservation(nextResult);
    setResult(nextResult);
    setCopied(false);
    setRemembered(true);
    setOctopusResult(null);
    setOctopusError(null);
    setSending(true);

    try {
      const octopus = await sendObservatoryObservation({
        id: `publisher-observation-${Date.now()}`,
        kind,
        title: nextResult.observation.source.label || safeValue.slice(0, 120),
        summary: nextResult.observation.summary,
        confidence: nextResult.observation.confidence,
        category: nextResult.observation.category,
        language: nextResult.observation.language,
        features: nextResult.extraction.features,
        patterns: nextResult.pack.patterns,
        recommendations: nextResult.pack.recommendations,
      });
      setOctopusResult(octopus);
    } catch (error) {
      setOctopusError(error instanceof Error ? error.message : "Octopus n'a pas pu mémoriser cette observation.");
    } finally {
      setSending(false);
    }
  };

  const copyPack = async () => {
    if (!packJson) return;
    await navigator.clipboard.writeText(packJson);
    setCopied(true);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge variant="outline" className="mb-3 font-mono uppercase tracking-widest">Knowledge Observatory</Badge>
          <h1 className="text-4xl font-serif font-bold text-foreground tracking-tight">Observatoire</h1>
          <p className="mt-2 max-w-3xl text-sm font-mono uppercase tracking-wider text-muted-foreground">
            Source → Observation → Extraction → Knowledge → Octopus → Mémoire
          </p>
        </div>
        <div className="rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
          Publisher observe et traduit. Octopus mémorise et relie.
        </div>
      </div>

      <Card className="border-border bg-card shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-serif text-2xl">
            <Telescope className="h-5 w-5 text-primary" />
            Nouvelle observation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[220px_1fr]">
            <label className="space-y-2">
              <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Type de source</span>
              <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground" value={kind} onChange={(event) => setKind(event.target.value as SourceKind)}>
                {SOURCE_KINDS.map((sourceKind) => <option key={sourceKind.value} value={sourceKind.value}>{sourceKind.label}</option>)}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Source a analyser</span>
              <textarea className="min-h-32 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Colle une URL, un depot GitHub, du texte, du Markdown ou une note PDF placeholder..." />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void runAnalysis()} className="gap-2" disabled={sending}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RadioTower className="h-4 w-4" />}
              {sending ? "Octopus mémorise…" : "Observer et mémoriser"}
            </Button>
            <span className="text-xs font-mono text-muted-foreground">Analyse locale, puis mémoire universelle via l'adaptateur Publisher.</span>
          </div>
        </CardContent>
      </Card>

      {remembered ? (
        <Card className={octopusError ? "border-amber-500/30 bg-amber-500/10" : "border-primary/20 bg-primary/10"}>
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3 text-sm">
                {octopusError ? <AlertTriangle className="h-4 w-4 text-amber-500" /> : <Database className="h-4 w-4 text-primary" />}
                <span className={octopusError ? "text-amber-600" : "text-primary"}>
                  {sending ? "Observation locale enregistrée. Octopus est en cours de consultation…" : octopusError ? `Observation locale conservée, mais ${octopusError}` : "Observation mémorisée localement et reliée par Octopus."}
                </span>
              </div>
              <Link href="/memory"><Button variant="outline" size="sm">Voir la mémoire</Button></Link>
            </div>

            {octopusResult ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-md border border-border bg-background/50 p-3"><p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Pertinence</p><p className="mt-1 text-2xl font-semibold text-foreground">{octopusResult.publisher.relevanceScore}%</p></div>
                <div className="rounded-md border border-border bg-background/50 p-3"><p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Nouveauté</p><p className="mt-1 text-2xl font-semibold text-foreground">{octopusResult.publisher.noveltyScore}%</p></div>
                <div className="rounded-md border border-border bg-background/50 p-3"><p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Relations</p><p className="mt-1 text-2xl font-semibold text-foreground">{octopusResult.publisher.relatedCount}</p></div>
                <div className="rounded-md border border-border bg-background/50 p-3"><p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Récolte</p><p className="mt-1 text-base font-semibold text-foreground">{priorityLabel(octopusResult.publisher.harvestPriority)}</p></div>
                <p className="sm:col-span-2 xl:col-span-4 text-sm text-muted-foreground">{octopusResult.publisher.summary}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {result ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <StepCard icon={Telescope} title="Source"><p className="font-medium text-foreground">{result.observation.source.label}</p><Badge variant="outline" className="font-mono text-[10px] uppercase">{result.observation.source.kind}</Badge></StepCard>
            <StepCard icon={RadioTower} title="Observation"><p>{result.observation.summary}</p><p>Confiance : {Math.round(result.observation.confidence * 100)}%</p></StepCard>
            <StepCard icon={FlaskConical} title="Extraction"><p>{result.extraction.features.length} fonctionnalites</p><p>{result.extraction.workflowPatterns.length} workflow patterns</p></StepCard>
            <StepCard icon={BrainCircuit} title="Knowledge"><p>{result.knowledge.length} themes regroupes</p><p>{result.pack.patterns.length} patterns</p></StepCard>
            <StepCard icon={PackageCheck} title="Mémoire" done={!octopusError}><p>{octopusResult ? "Mémoire universelle consultée." : "Pack enregistré localement."}</p><Badge className="font-mono text-[10px] uppercase">{octopusResult ? "octopus" : "local"}</Badge></StepCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="border-border bg-card shadow-md"><CardHeader><CardTitle className="font-serif text-2xl">Observation</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><ListBlock title="Signaux bruts" items={result.observation.rawSignals} /><ListBlock title="Technologies supposees" items={result.observation.detectedTechnologies} /></div><div className="flex flex-wrap gap-2"><Badge variant="outline">{result.observation.category}</Badge><Badge variant="outline">langue : {result.observation.language}</Badge><Badge variant="outline">confiance : {Math.round(result.observation.confidence * 100)}%</Badge></div></CardContent></Card>
            <Card className="border-border bg-card shadow-md"><CardHeader><CardTitle className="font-serif text-2xl">Extraction</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><ListBlock title="Fonctionnalites" items={result.extraction.features} /><ListBlock title="Business model" items={result.extraction.businessModel} /><ListBlock title="UX" items={result.extraction.ux} /><ListBlock title="Architecture supposee" items={result.extraction.assumedArchitecture} /><ListBlock title="Automatisations possibles" items={result.extraction.possibleAutomations} /><ListBlock title="Risques" items={result.extraction.risks} /></CardContent></Card>
          </div>

          <Card className="border-border bg-card shadow-md"><CardHeader><CardTitle className="font-serif text-2xl">Knowledge regroupe</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">{result.knowledge.map((theme) => <ListBlock key={theme.id} title={theme.title} items={theme.items} />)}</CardContent></Card>

          <Card className="border-border bg-card shadow-md">
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><CardTitle className="font-serif text-2xl">Knowledge Pack</CardTitle><p className="mt-1 text-sm text-muted-foreground">Objet local exportable ; l'observation neutre est envoyée à Octopus par l'adaptateur Publisher.</p></div><Button variant="outline" onClick={copyPack} className="gap-2">{copied ? <CheckCircle2 className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}{copied ? "Copie" : "Copier JSON"}</Button></CardHeader>
            <CardContent className="space-y-4"><div className="grid gap-4 md:grid-cols-3"><ListBlock title="Capabilities" items={result.pack.capabilities} /><ListBlock title="Patterns" items={result.pack.patterns} /><ListBlock title="Recommendations" items={result.pack.recommendations} /></div><pre className="max-h-96 overflow-auto rounded-lg border border-border bg-background p-4 text-xs text-muted-foreground">{packJson}</pre></CardContent>
          </Card>
        </>
      ) : (
        <Card className="border-dashed border-border bg-card/50"><CardContent className="flex flex-col items-center justify-center gap-3 p-10 text-center"><Send className="h-8 w-8 text-muted-foreground" /><p className="font-mono text-sm text-muted-foreground">Lance une analyse pour creer la premiere Observation.</p></CardContent></Card>
      )}
    </div>
  );
}
