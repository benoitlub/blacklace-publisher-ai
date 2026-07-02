import { useState } from "react";
import { useGetCalendar, getGetCalendarQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import { Calendar as CalendarIcon, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { loadHarvestDrafts, mergePublicationDrafts, recordActivity, syncPublisherLoopFromServer, type PublicationDraft } from "@/lib/missions";

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
  const [isGeneratingMonth, setIsGeneratingMonth] = useState(false);

  const { data: posts, isLoading } = useGetCalendar({
    query: { queryKey: getGetCalendarQueryKey() }
  });

  const generateMonth = async () => {
    setIsGeneratingMonth(true);
    try {
      await syncPublisherLoopFromServer();
      const response = await fetch("/api/generate/month", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ harvestDrafts: loadHarvestDrafts() })
      });
      const payload = (await response.json()) as {
        count?: number;
        publicationDrafts?: Array<Omit<PublicationDraft, "id" | "status" | "createdAt" | "updatedAt">>;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Generation de mois indisponible");
      }

      const now = new Date().toISOString();
      const publicationDrafts: PublicationDraft[] = (payload.publicationDrafts ?? []).map((draft) => ({
        ...draft,
        id: crypto.randomUUID(),
        status: "ready-to-publish",
        createdAt: now,
        updatedAt: now
      }));

      mergePublicationDrafts(publicationDrafts);
      recordActivity({
        type: "publication-draft-generated",
        label: "Mois editorial genere",
        detail: `${payload.count ?? publicationDrafts.length} publication(s) planifiee(s)`
      });
      await queryClient.invalidateQueries({ queryKey: getGetCalendarQueryKey() });
      toast({
        title: "Operation reussie",
        description: "Le mois de contenu a ete genere depuis les HarvestDrafts et les personas."
      });
    } catch (error) {
      toast({
        title: "Echec de l'operation",
        description: error instanceof Error ? error.message : "La generation de contenu a echoue.",
        variant: "destructive"
      });
    } finally {
      setIsGeneratingMonth(false);
    }
  };

  type CalendarPost = NonNullable<typeof posts>[number];
  const groupedPosts = (posts || []).reduce<Record<string, CalendarPost[]>>((acc, post) => {
    if (!post.scheduledAt) return acc;
    const date = format(parseISO(post.scheduledAt), "yyyy-MM-dd");
    if (!acc[date]) acc[date] = [];
    acc[date].push(post);
    return acc;
  }, {});

  const dates = Object.keys(groupedPosts).sort();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-serif font-bold text-foreground mb-2 tracking-tight">Planification</h1>
          <p className="text-muted-foreground font-mono text-sm uppercase tracking-wider">Les 30 prochains jours</p>
        </div>
        <Button
          onClick={generateMonth}
          disabled={isGeneratingMonth}
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-mono font-bold"
        >
          {isGeneratingMonth ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin">o</span> Generation...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Generer un mois
            </span>
          )}
        </Button>
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
                            <span>{post.agentName || "Persona Publisher"}</span>
                            {post.universe && <span>- {post.universe}</span>}
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
          <p className="text-muted-foreground font-mono text-sm">Aucune publication planifiee pour les 30 prochains jours.</p>
        </div>
      )}
    </div>
  );
}

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}
