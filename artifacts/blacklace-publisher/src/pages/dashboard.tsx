import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useGetDashboardStats, getGetDashboardStatsQueryKey, useGetRecentPosts, getGetRecentPostsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MissionPanel } from "@/components/mission-panel";
import { GardenReportPanel } from "@/components/garden-report-panel";
import { KnowledgeSourceStatus } from "@/components/knowledge-source-status";
import { PublisherLoopPanel } from "@/components/publisher-loop-panel";
import { loadActivityEntries, PUBLISHER_LOOP_CHANGED_EVENT, type ActivityEntry } from "@/lib/missions";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats({
    query: { queryKey: getGetDashboardStatsQueryKey() }
  });
  
  const { data: recentPosts, isLoading: postsLoading } = useGetRecentPosts({
    query: { queryKey: getGetRecentPostsQueryKey() }
  });
  const [activityEntries, setActivityEntries] = useState<ActivityEntry[]>([]);

  useEffect(() => {
    const refreshActivity = () => setActivityEntries(loadActivityEntries());
    refreshActivity();
    window.addEventListener(PUBLISHER_LOOP_CHANGED_EVENT, refreshActivity);
    window.addEventListener("storage", refreshActivity);
    return () => {
      window.removeEventListener(PUBLISHER_LOOP_CHANGED_EVENT, refreshActivity);
      window.removeEventListener("storage", refreshActivity);
    };
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge variant="outline" className="mb-3 font-mono uppercase tracking-widest">Knowledge Observatory</Badge>
          <h1 className="text-4xl font-serif font-bold text-foreground mb-2 tracking-tight">Cabane a connaissances du Poulpe</h1>
          <p className="text-muted-foreground font-mono text-sm uppercase tracking-wider">Missions, memoire, jardin, observations et publications</p>
        </div>
        <Link href="/observatory">
          <Button className="w-fit">Ouvrir l'Observatoire</Button>
        </Link>
      </div>

      <KnowledgeSourceStatus />

      <MissionPanel />

      <PublisherLoopPanel />

      <GardenReportPanel />

      {statsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 w-full bg-secondary" />)}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-border bg-card shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-mono text-muted-foreground uppercase tracking-widest">Publications Prévues</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-serif text-primary">{stats.scheduledCount + stats.publishedCount} / {stats.totalPostsThisMonth}</div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-mono text-muted-foreground uppercase tracking-widest">Brouillons Actifs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-serif text-foreground">{stats.draftCount}</div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-mono text-muted-foreground uppercase tracking-widest">Campagnes en cours</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-serif text-foreground">{stats.activeCampaigns}</div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-mono text-muted-foreground uppercase tracking-widest">Agents Actifs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-serif text-foreground">{stats.activeAgents}</div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="space-y-4">
        <h2 className="text-xl font-serif font-semibold border-b border-border pb-2">Activité Récente</h2>
        
        {activityEntries.length > 0 ? (
          <div className="space-y-3">
            {activityEntries.map((entry) => (
              <Card key={entry.id} className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-serif font-medium text-foreground">{entry.label}</h3>
                        <Badge variant="outline" className="font-mono text-[10px] uppercase bg-secondary/50">
                          {entry.type}
                        </Badge>
                      </div>
                      {entry.detail ? <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{entry.detail}</p> : null}
                    </div>
                    <span className="shrink-0 text-xs font-mono text-muted-foreground">
                      {format(new Date(entry.createdAt), "dd MMM HH:mm", { locale: fr })}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : postsLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full bg-secondary" />)}
          </div>
        ) : recentPosts?.length ? (
          <div className="space-y-4">
            {recentPosts.map((post) => (
              <Card key={post.id} className="bg-card border-border hover:border-primary/50 transition-colors">
                <CardContent className="p-4 flex items-start gap-4">
                  <div className="w-16 h-16 rounded bg-secondary flex-shrink-0 flex items-center justify-center font-mono text-xs text-muted-foreground border border-border">
                    {post.platform}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-serif font-medium truncate text-foreground">{post.title}</h3>
                      <Badge variant="outline" className="font-mono text-[10px] uppercase bg-secondary/50">
                        {post.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-1">{post.content}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs font-mono text-muted-foreground">
                      <span>Agent: {post.agentName || "Anonyme"}</span>
                      {post.scheduledAt && (
                        <span>Date: {format(new Date(post.scheduledAt), "dd MMM yyyy", { locale: fr })}</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center border border-dashed border-border rounded-lg bg-card/50">
            <p className="text-muted-foreground font-mono">Aucune activité récente.</p>
          </div>
        )}
      </div>
    </div>
  );
}
