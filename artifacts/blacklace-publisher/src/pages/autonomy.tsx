import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PublisherAutonomyTask } from "@/models/autonomy";
import { buildPublisherDailyPlan } from "@/autonomy/build-daily-plan";
import { Bot, CalendarClock, CheckCircle2, Clock3, Moon, RefreshCw, ShieldCheck, Sun, Sunrise } from "lucide-react";

const TIME_ICON = {
  matin: Sunrise,
  midi: Sun,
  soir: Clock3,
  nuit: Moon,
} as const;

const KIND_LABEL: Record<PublisherAutonomyTask["kind"], string> = {
  observe: "Observer",
  compare: "Comparer",
  greenhouse: "Jardiner",
  review: "Revoir",
  report: "Rapport",
};

function TaskCard({ task }: { task: PublisherAutonomyTask }) {
  const Icon = TIME_ICON[task.suggestedTime];

  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 font-serif text-xl text-foreground">
              <Icon className="h-5 w-5 text-primary" />
              {task.title}
            </CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">{task.detail}</p>
          </div>
          <Badge variant="outline" className="w-fit font-mono text-[10px] uppercase">
            {task.suggestedTime}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          <Badge className="bg-secondary text-secondary-foreground hover:bg-secondary">{KIND_LABEL[task.kind]}</Badge>
          <Badge variant="outline">confiance {Math.round(task.confidence * 100)}%</Badge>
          <Badge variant="outline">{task.status}</Badge>
        </div>
        {task.targetHref ? (
          <Link href={task.targetHref}>
            <Button variant="outline" size="sm">Ouvrir</Button>
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function Autonomy() {
  const [refreshKey, setRefreshKey] = useState(0);
  const plan = useMemo(() => buildPublisherDailyPlan(), [refreshKey]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge variant="outline" className="mb-3 font-mono uppercase tracking-widest">Autonomie locale</Badge>
          <h1 className="text-4xl font-serif font-bold text-foreground tracking-tight">Routine du Publisher</h1>
          <p className="mt-2 max-w-3xl text-sm font-mono uppercase tracking-wider text-muted-foreground">
            Planning quotidien → veille → comparaison → serre → rapport
          </p>
        </div>
        <Button variant="outline" onClick={() => setRefreshKey((value) => value + 1)} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Recalculer
        </Button>
      </div>

      <Card className="border-primary/20 bg-primary/10">
        <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center">
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-serif text-xl text-primary">
              <Bot className="h-5 w-5" />
              Publisher prépare. L'humain valide. Octopus Engine reste neutre.
            </div>
            <p className="text-sm text-muted-foreground">{plan.summary}</p>
          </div>
          <Badge className="w-fit font-mono uppercase">{plan.mode}</Badge>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-mono uppercase tracking-widest text-muted-foreground">
              <CalendarClock className="h-4 w-4 text-primary" />
              Aujourd'hui
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-3xl font-serif text-primary">{plan.dateKey}</div></CardContent>
        </Card>
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-mono uppercase tracking-widest text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Tâches
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-4xl font-serif text-foreground">{plan.tasks.length}</div></CardContent>
        </Card>
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-mono uppercase tracking-widest text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Sécurité
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-lg font-serif text-foreground">Sans action externe</div></CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="font-serif text-2xl">Signal du jour</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{plan.dailySignal}</p>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="border-b border-border pb-2">
          <h2 className="text-xl font-serif font-semibold">Planning proposé</h2>
          <p className="mt-1 text-xs font-mono uppercase tracking-widest text-muted-foreground">
            Ce planning ne lance rien tout seul : il prépare la veille.
          </p>
        </div>
        {plan.tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}
