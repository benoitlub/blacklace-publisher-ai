import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, ClipboardList, Radar as RadarIcon, Search, Sparkles, Target, Telescope } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RadarCandidate, RadarScanResult } from "@/models/radar";
import { extractRadarCandidates } from "@/radar/extract-candidates";

const DEFAULT_RADAR_SOURCE = `Lovable - AI app builder pour creer des applications web depuis un prompt
https://bolt.new - prototype apps full-stack avec IA
https://github.com/vercel/ai - SDK open source pour agents et apps IA
Gamma - creation de presentations par IA
Make - automatisation visuelle de workflows SaaS`;

function CandidateCard({ candidate }: { candidate: RadarCandidate }) {
  const observatoryHref = `/observatory?kind=${encodeURIComponent(candidate.sourceKind)}&value=${encodeURIComponent(candidate.sourceValue)}`;

  return (
    <Card className="border-border bg-card shadow-sm transition-colors hover:border-primary/40">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="font-serif text-xl text-foreground">{candidate.name}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{candidate.description}</p>
          </div>
          <div className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 font-mono text-sm text-primary">
            {candidate.interestScore}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="font-mono text-[10px] uppercase">{candidate.category}</Badge>
          <Badge variant="outline" className="font-mono text-[10px] uppercase">{candidate.sourceKind}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Signaux detectes</div>
          <div className="flex flex-wrap gap-2">
            {candidate.signals.map((signal) => (
              <Badge key={signal} className="bg-secondary text-secondary-foreground hover:bg-secondary">{signal}</Badge>
            ))}
          </div>
        </div>
        <div className="rounded-md border border-border bg-background p-3 text-xs text-muted-foreground break-all">
          {candidate.sourceValue}
        </div>
        <Link href={observatoryHref}>
          <Button className="w-full gap-2">
            <Telescope className="h-4 w-4" />
            Observer
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

export default function Radar() {
  const [rawSource, setRawSource] = useState(DEFAULT_RADAR_SOURCE);
  const [scan, setScan] = useState<RadarScanResult | null>(null);

  const topCandidates = useMemo(() => scan?.candidates ?? [], [scan]);

  const runScan = () => {
    const safeSource = rawSource.trim() || DEFAULT_RADAR_SOURCE;
    setScan(extractRadarCandidates(safeSource));
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge variant="outline" className="mb-3 font-mono uppercase tracking-widest">Radar SaaS</Badge>
          <h1 className="text-4xl font-serif font-bold text-foreground tracking-tight">Radar</h1>
          <p className="mt-2 max-w-3xl text-sm font-mono uppercase tracking-wider text-muted-foreground">
            Source brute → candidats SaaS → tri → Observer
          </p>
        </div>
        <div className="rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
          Le Radar trouve. L'Observatoire analyse. Le Poulpe decide.
        </div>
      </div>

      <Card className="border-border bg-card shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-serif text-2xl">
            <RadarIcon className="h-5 w-5 text-primary" />
            Source brute
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <textarea
            className="min-h-48 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary"
            value={rawSource}
            onChange={(event) => setRawSource(event.target.value)}
            placeholder="Colle une liste de noms, URLs, descriptions, extraits de newsletter ou notes de veille..."
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={runScan} className="gap-2">
              <Search className="h-4 w-4" />
              Scanner les candidats
            </Button>
            <span className="text-xs font-mono text-muted-foreground">V1 locale : aucun scraping, aucun LLM, aucune API externe.</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-mono uppercase tracking-widest text-muted-foreground">
              <ClipboardList className="h-4 w-4 text-primary" />
              Candidats
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-serif text-primary">{topCandidates.length}</div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-mono uppercase tracking-widest text-muted-foreground">
              <Target className="h-4 w-4 text-primary" />
              Meilleur score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-serif text-foreground">{topCandidates[0]?.interestScore ?? "—"}</div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-mono uppercase tracking-widest text-muted-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              Mode
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-serif text-foreground">Extraction locale</div>
          </CardContent>
        </Card>
      </div>

      {scan ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
            <h2 className="text-xl font-serif font-semibold">Candidats detectes</h2>
            <span className="text-xs font-mono text-muted-foreground">tries par score d'interet mock</span>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {topCandidates.map((candidate) => (
              <CandidateCard key={candidate.id} candidate={candidate} />
            ))}
          </div>
        </div>
      ) : (
        <Card className="border-dashed border-border bg-card/50">
          <CardContent className="flex flex-col items-center justify-center gap-3 p-10 text-center">
            <RadarIcon className="h-8 w-8 text-muted-foreground" />
            <p className="font-mono text-sm text-muted-foreground">Scanne une source brute pour faire apparaitre les premiers candidats.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
