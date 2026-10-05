import { useGetCalendar, getGetCalendarQueryKey, useGenerateMonth } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import { Calendar as CalendarIcon, Sparkles, BrainCircuit, Gauge, Shuffle, TimerReset } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  approved: "bg-blue-900/50 text-blue-200 border-blue-800",
  scheduled: "bg-amber-900/50 text-amber-200 border-amber-800",
  published: "bg-green-900/50 text-green-200 border-green-800",
  failed: "bg-destructive/50 text-destructive-foreground border-destructive",
};

export default function Calendar() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: posts, isLoading } = useGetCalendar({
    query: { queryKey: getGetCalendarQueryKey() }
  });

  const generateMonth = useGenerateMonth({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCalendarQueryKey() });
        toast({
          title: "Opération réussie",
          description: "Le mois de contenu a été généré.",
        });
      },
      onError: () => {
        toast({
          title: "Échec de l'opération",
          description: "La génération de contenu a échoué.",
          variant: "destructive"
        });
      }
    }
  });

  // Group by date
  const groupedPosts = (posts || []).reduce((acc: Record<string, typeof posts>, post) => {
    if (!post.scheduledAt) return acc;
    const date = format(parseISO(post.scheduledAt), "yyyy-MM-dd");
    if (!acc[date]) acc[date] = [];
    acc[date].push(post);
    return acc;
  }, {});

  const dates = Object.keys(groupedPosts).sort();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-primary">
            <BrainCircuit className="h-3.5 w-3.5" /> Gérard · planning vivant
          </div>
          <h1 className="text-4xl font-serif font-bold text-foreground mb-2 tracking-tight">Planification</h1>
          <p className="text-muted-foreground font-mono text-sm">Les 30 prochains jours · le calendrier s'adapte aux signaux sociaux.</p>
        </div>
        <Button 
          onClick={() => generateMonth.mutate()} 
          disabled={generateMonth.isPending}
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-mono font-bold"
        >
          {generateMonth.isPending ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin">◌</span> Génération...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Générer un mois
            </span>
          )}
        </Button>
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Rule icon={Gauge} title="Cadence" value="2 / jour max." detail="Évite le matraquage et laisse respirer chaque publication." />
        <Rule icon={TimerReset} title="Espacement" value="4 h minimum" detail="Deux contenus ne doivent pas se cannibaliser." />
        <Rule icon={Shuffle} title="Rotation" value="Alterner les projets" detail="Livre, jeu et univers tournent avant de répéter le même sujet." />
        <Rule icon={BrainCircuit} title="Décision" value="Stats → créneau" detail="Reproduire ou muter ce qui marche ; observer avant de conclure." />
      </section>

      <div className="rounded border border-primary/25 bg-primary/10 px-4 py-3 font-mono text-xs text-muted-foreground">
        Gérard propose les dates et formats. Les créneaux restent en supervision tant que la sortie Metricool automatique n'est pas activée.
      </div>

      {isLoading ? (
        <div className="space-y-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-4">
              <Skeleton className="h-6 w-32 bg-secondary" />
              <Skeleton className="h-24 w-full bg-secondary" />
            </div>
          ))}
        </div>
      ) : dates.length ? (
        <div className="space-y-8">
          {dates.map((dateStr) => {
            const datePosts = groupedPosts[dateStr];
            return (
              <div key={dateStr} className="space-y-4">
                <div className="flex items-center gap-2 border-b border-border pb-2">
                  <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                  <h2 className="text-lg font-serif font-semibold text-foreground">
                    {format(parseISO(dateStr), "EEEE d MMMM", { locale: fr })}
                  </h2>
                </div>
                <div className="grid gap-3">
                  {(datePosts ?? []).map((post) => (
                    <Card key={post.id} className="bg-card border-border hover:border-primary/30 transition-colors">
                      <CardContent className="p-4 flex items-center gap-4">
                        <div className="w-12 h-12 rounded bg-secondary flex-shrink-0 flex items-center justify-center font-mono text-[10px] text-muted-foreground uppercase border border-border">
                          {post.platform}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-serif font-medium truncate text-foreground">{post.title}</h3>
                          <div className="flex items-center gap-4 mt-1 text-xs font-mono text-muted-foreground">
                            <span>{post.agentName || "Anonyme"}</span>
                            {post.universe && <span>• {post.universe}</span>}
                          </div>
                        </div>
                        <Badge variant="outline" className={cn("font-mono text-[10px] uppercase", STATUS_COLORS[post.status] || "bg-secondary")}>
                          {post.status}
                        </Badge>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-12 text-center border border-dashed border-border rounded-lg bg-card/50">
          <CalendarIcon className="w-8 h-8 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-serif mb-2">Calendrier vide</h3>
          <p className="text-muted-foreground font-mono text-sm">Aucune publication planifiée pour les 30 prochains jours.</p>
        </div>
      )}
    </div>
  );
}

function Rule({ icon: Icon, title, value, detail }: { icon: any; title: string; value: string; detail: string }) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <Icon className="h-4 w-4 text-primary" /> {title}
        </div>
        <div className="font-serif text-xl text-foreground">{value}</div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}
