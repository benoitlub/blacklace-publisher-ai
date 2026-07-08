import { useMemo, useState } from "react";
import { BrainCircuit, CheckCircle2, Clipboard, FlaskConical, PackageCheck, RadioTower, Send, Telescope } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { KnowledgeObservatoryResult, SourceKind } from "@/models/knowledge-observatory";
import { runKnowledgeObservatory } from "@/services/knowledge-observatory";

const SOURCE_KINDS: Array<{ value: SourceKind; label: string }> = [
  { value: "url", label: "URL" },
  { value: "github", label: "Depot GitHub" },
  { value: "text", label: "Texte" },
  { value: "markdown", label: "Markdown" },
  { value: "pdf", label: "PDF placeholder" },
];

const DEFAULT_SOURCE = "Lovable est un outil de creation d'applications web a partir de prompts. Il combine generation UI, composants React, publication rapide et iteration produit.";

function StepCard({ icon: Icon, title, children, done = true }: { icon: typeof Telescope; title: string; children: React.ReactNode; done?: boolean }) {
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

export default function Observatory() {
  const [kind, setKind] = useState<SourceKind>("text");
  const [value, setValue] = useState(DEFAULT_SOURCE);
  const [result, setResult] = useState<KnowledgeObservatoryResult | null>(null);
  const [copied, setCopied] = useState(false);

  const packJson = useMemo(() => (result ? JSON.stringify(result.pack, null, 2) : ""), [result]);

  const runAnalysis = () => {
    const safeValue = value.trim() || DEFAULT_SOURCE;
    setResult(runKnowledgeObservatory({ kind, value: safeValue }));
    setCopied(false);
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
            Source → Observation → Extraction → Knowledge → Knowledge Pack → Export Octopus mock
          </p>
        </div>
        <div className="rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
          Publisher observe. Octopus decide. Gerard jardine.
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
              <select
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                value={kind}
                onChange={(event) => setKind(event.target.value as SourceKind)}
              >
                {SOURCE_KINDS.map((sourceKind) => (
                  <option key={sourceKind.value} value={sourceKind.value}>{sourceKind.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Source a analyser</span>
              <textarea
                className="min-h-32 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="Colle une URL, un depot GitHub, du texte, du Markdown ou une note PDF placeholder..."
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={runAnalysis} className="gap-2">
              <RadioTower className="h-4 w-4" />
              Lancer l'analyse locale
            </Button>
            <span className="text-xs font-mono text-muted-foreground">Aucun appel reseau. Aucun LLM. Export Octopus simule.</span>
          </div>
        </CardContent>
      </Card>

      {result ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <StepCard icon={Telescope} title="Source">
              <p className="font-medium text-foreground">{result.observation.source.label}</p>
              <Badge variant="outline" className="font-mono text-[10px] uppercase">{result.observation.source.kind}</Badge>
            </StepCard>
            <StepCard icon={RadioTower} title="Observation">
              <p>{result.observation.summary}</p>
              <p>Confiance : {Math.round(result.observation.confidence * 100)}%</p>
            </StepCard>
            <StepCard icon={FlaskConical} title="Extraction">
              <p>{result.extraction.features.length} fonctionnalites</p>
              <p>{result.extraction.workflowPatterns.length} workflow patterns</p>
            </StepCard>
            <StepCard icon={BrainCircuit} title="Knowledge">
              <p>{result.knowledge.length} themes regroupes</p>
              <p>{result.pack.patterns.length} patterns</p>
            </StepCard>
            <StepCard icon={PackageCheck} title="Export">
              <p>{result.exportResult.message}</p>
              <Badge className="font-mono text-[10px] uppercase">{result.exportResult.mode}</Badge>
            </StepCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="border-border bg-card shadow-md">
              <CardHeader>
                <CardTitle className="font-serif text-2xl">Observation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <ListBlock title="Signaux bruts" items={result.observation.rawSignals} />
                  <ListBlock title="Technologies supposees" items={result.observation.detectedTechnologies} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{result.observation.category}</Badge>
                  <Badge variant="outline">langue : {result.observation.language}</Badge>
                  <Badge variant="outline">confiance : {Math.round(result.observation.confidence * 100)}%</Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card shadow-md">
              <CardHeader>
                <CardTitle className="font-serif text-2xl">Extraction</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <ListBlock title="Fonctionnalites" items={result.extraction.features} />
                <ListBlock title="Business model" items={result.extraction.businessModel} />
                <ListBlock title="UX" items={result.extraction.ux} />
                <ListBlock title="Architecture supposee" items={result.extraction.assumedArchitecture} />
                <ListBlock title="Automatisations possibles" items={result.extraction.possibleAutomations} />
                <ListBlock title="Risques" items={result.extraction.risks} />
              </CardContent>
            </Card>
          </div>

          <Card className="border-border bg-card shadow-md">
            <CardHeader>
              <CardTitle className="font-serif text-2xl">Knowledge regroupe</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {result.knowledge.map((theme) => (
                <ListBlock key={theme.id} title={theme.title} items={theme.items} />
              ))}
            </CardContent>
          </Card>

          <Card className="border-border bg-card shadow-md">
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="font-serif text-2xl">Knowledge Pack</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Objet exportable vers Octopus Engine, sans dependance directe.</p>
              </div>
              <Button variant="outline" onClick={copyPack} className="gap-2">
                {copied ? <CheckCircle2 className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
                {copied ? "Copie" : "Copier JSON"}
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <ListBlock title="Capabilities" items={result.pack.capabilities} />
                <ListBlock title="Patterns" items={result.pack.patterns} />
                <ListBlock title="Recommendations" items={result.pack.recommendations} />
              </div>
              <pre className="max-h-96 overflow-auto rounded-lg border border-border bg-background p-4 text-xs text-muted-foreground">
                {packJson}
              </pre>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card className="border-dashed border-border bg-card/50">
          <CardContent className="flex flex-col items-center justify-center gap-3 p-10 text-center">
            <Send className="h-8 w-8 text-muted-foreground" />
            <p className="font-mono text-sm text-muted-foreground">Lance une analyse pour creer la premiere Observation.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
