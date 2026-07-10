import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PublisherAutonomyTask } from "@/models/autonomy";
import { buildPublisherDailyPlan } from "@/autonomy/build-daily-plan";
import { prepareHarvestKit, type HarvestKit } from "@/autonomy/prepare-harvest-kit";
import { Bot, CalendarClock, CheckCircle2, Clock3, Loader2, Moon, RefreshCw, ShieldCheck, Sparkles, Sun, Sunrise } from "lucide-react";

const TIME_ICON = { matin: Sunrise, midi: Sun, soir: Clock3, nuit: Moon } as const;
const STORAGE_KEY = "blacklace:gerard:harvest-kit";

const KIND_LABEL: Record<PublisherAutonomyTask["kind"], string> = {
  sell: "Récolter", improve: "Améliorer", automate: "Automatiser", observe: "Observer",
  compare: "Comparer", greenhouse: "Jardiner", review: "Revoir", report: "Rapport",
};

function TaskCard({ task }: { task: PublisherAutonomyTask }) {
  const Icon = TIME_ICON[task.suggestedTime];
  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 font-serif text-xl text-foreground"><Icon className="h-5 w-5 text-primary" />{task.title}</CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">{task.detail}</p>
          </div>
          <Badge variant="outline" className="w-fit font-mono text-[10px] uppercase">{task.suggestedTime}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          <Badge className="bg-secondary text-secondary-foreground hover:bg-secondary">{KIND_LABEL[task.kind]}</Badge>
          <Badge variant="outline">confiance {Math.round(task.confidence * 100)}%</Badge>
          <Badge variant="outline">{task.status}</Badge>
          <Badge variant="outline">réduit le travail humain</Badge>
        </div>
        {task.targetHref ? <Link href={task.targetHref}><Button variant="outline" size="sm">Ouvrir</Button></Link> : null}
      </CardContent>
    </Card>
  );
}

function KitBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="mb-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">{title}</div>
      <p className="whitespace-pre-wrap text-sm text-foreground">{value}</p>
    </div>
  );
}

export default function Autonomy() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [kit, setKit] = useState<HarvestKit | null>(null);
  const [preparing, setPreparing] = useState(false);
  const plan = useMemo(() => buildPublisherDailyPlan(), [refreshKey]);

  const prepare = async (force = false) => {
    if (preparing) return;
    if (!force) {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as HarvestKit;
          if (parsed.generatedAt.slice(0, 10) === new Date().toISOString().slice(0, 10)) {
            setKit(parsed);
            return;
          }
        } catch { localStorage.removeItem(STORAGE_KEY); }
      }
    }
    setPreparing(true);
    const next = await prepareHarvestKit();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setKit(next);
    setPreparing(false);
  };

  useEffect(() => { void prepare(false); }, []);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge variant="outline" className="mb-3 font-mono uppercase tracking-widest">Mode Survivor · Niveau 2</Badge>
          <h1 className="text-4xl font-serif font-bold text-foreground tracking-tight">Routine de Gérard</h1>
          <p className="mt-2 max-w-3xl text-sm font-mono uppercase tracking-wider text-muted-foreground">Choisir l'existant → préparer tout → faire valider</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setRefreshKey((value) => value + 1)} className="gap-2"><RefreshCw className="h-4 w-4" />Recalculer</Button>
          <Button onClick={() => void prepare(true)} disabled={preparing} className="gap-2">
            {preparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Préparer maintenant
          </Button>
        </div>
      </div>

      <Card className="border-primary/20 bg-primary/10">
        <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center">
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-serif text-xl text-primary"><Bot className="h-5 w-5" />Gérard prépare automatiquement une récolte complète chaque jour.</div>
            <p className="text-sm text-muted-foreground">{plan.summary}</p>
          </div>
          <Badge className="w-fit font-mono uppercase">{plan.mode}</Badge>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-mono uppercase tracking-widest text-muted-foreground"><CalendarClock className="h-4 w-4 text-primary" />Aujourd'hui</CardTitle></CardHeader><CardContent><div className="text-3xl font-serif text-primary">{plan.dateKey}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-mono uppercase tracking-widest text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-primary" />Tâches utiles</CardTitle></CardHeader><CardContent><div className="text-4xl font-serif text-foreground">{plan.tasks.length}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-mono uppercase tracking-widest text-muted-foreground"><ShieldCheck className="h-4 w-4 text-primary" />Indice de survie</CardTitle></CardHeader><CardContent><div className="text-4xl font-serif text-foreground">{plan.survivalIndex}/100</div></CardContent></Card>
      </div>

      {preparing ? (
        <Card className="border-dashed"><CardContent className="flex items-center justify-center gap-3 p-10"><Loader2 className="h-5 w-5 animate-spin" /><span>Gérard choisit une récolte et prépare le paquet complet…</span></CardContent></Card>
      ) : kit ? (
        <Card className="border-primary/30 shadow-md">
          <CardHeader>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div><Badge className="mb-2">Récolte préparée</Badge><CardTitle className="font-serif text-2xl">{kit.sourceTitle}</CardTitle></div>
              <Badge variant="outline">{kit.provider}</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <KitBlock title="Promesse" value={kit.promise} />
            <KitBlock title="Offre" value={kit.offer} />
            <KitBlock title="Page de vente" value={kit.salesPage} />
            <KitBlock title="LinkedIn" value={kit.linkedinPost} />
            <KitBlock title="Facebook" value={kit.facebookPost} />
            <KitBlock title="Post court" value={kit.shortPost} />
            <KitBlock title="Message direct" value={kit.directMessage} />
            <KitBlock title="Prompt visuel" value={kit.visualPrompt} />
            <KitBlock title="Storyboard vidéo" value={kit.videoStoryboard} />
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="mb-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">Blocages à lever</div>
              <ul className="space-y-2 text-sm">{kit.blockingPoints.map((point) => <li key={point}>• {point}</li>)}</ul>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card><CardHeader><CardTitle className="font-serif text-2xl">Signal du jour</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{plan.dailySignal}</p></CardContent></Card>

      <div className="space-y-4">
        <div className="border-b border-border pb-2"><h2 className="text-xl font-serif font-semibold">Travail préparé par Gérard</h2><p className="mt-1 text-xs font-mono uppercase tracking-widest text-muted-foreground">Une tâche qui ajoute une corvée à Benoît est rejetée.</p></div>
        {plan.tasks.map((task) => <TaskCard key={task.id} task={task} />)}
      </div>
    </div>
  );
}
