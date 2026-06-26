import { useListCampaigns, getListCampaignsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Megaphone, Target, Calendar as CalendarIcon } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  planning: "bg-muted text-muted-foreground",
  active: "bg-green-900/50 text-green-200 border-green-800",
  paused: "bg-amber-900/50 text-amber-200 border-amber-800",
  completed: "bg-blue-900/50 text-blue-200 border-blue-800",
  archived: "bg-slate-900/50 text-slate-300 border-slate-800",
};

export default function Campaigns() {
  const { data: campaigns, isLoading } = useListCampaigns({
    query: { queryKey: getListCampaignsQueryKey() }
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-serif font-bold text-foreground mb-2 tracking-tight">Opérations</h1>
          <p className="text-muted-foreground font-mono text-sm uppercase tracking-wider">Campagnes Actives</p>
        </div>
        <Button className="bg-secondary hover:bg-secondary/80 text-foreground font-mono font-bold">
          Nouvelle Opération
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-64 w-full bg-secondary" />
          ))}
        </div>
      ) : campaigns?.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {campaigns.map((campaign) => (
            <Card key={campaign.id} className="bg-card border-border hover:border-primary/30 transition-colors flex flex-col">
              <CardHeader className="pb-4 border-b border-border/50">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <Badge variant="outline" className={cn("font-mono text-[10px] uppercase mb-2", STATUS_COLORS[campaign.status] || "bg-secondary")}>
                      {campaign.status}
                    </Badge>
                    <CardTitle className="text-xl font-serif">{campaign.name}</CardTitle>
                    {campaign.universe && (
                      <p className="text-sm font-mono text-primary/80 uppercase">Univers: {campaign.universe}</p>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4 flex-1 flex flex-col justify-between space-y-4">
                {campaign.objective && (
                  <div>
                    <div className="flex items-center gap-2 mb-1 text-muted-foreground font-mono text-xs uppercase">
                      <Target className="w-3 h-3" /> Objectif
                    </div>
                    <p className="text-sm">{campaign.objective}</p>
                  </div>
                )}
                
                <div className="bg-secondary/50 p-3 rounded-md space-y-2 border border-border/50">
                  <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                    <CalendarIcon className="w-3 h-3" />
                    {campaign.startDate ? format(parseISO(campaign.startDate), "dd MMM yyyy", { locale: fr }) : "Non défini"} 
                    {" - "} 
                    {campaign.endDate ? format(parseISO(campaign.endDate), "dd MMM yyyy", { locale: fr }) : "Non défini"}
                  </div>
                  
                  {campaign.platforms && (
                    <div className="flex gap-2 text-xs font-mono">
                      <span className="text-muted-foreground">Vecteurs:</span>
                      <span className="text-foreground">{campaign.platforms}</span>
                    </div>
                  )}
                  
                  {campaign.assignedAgents && (
                    <div className="flex gap-2 text-xs font-mono">
                      <span className="text-muted-foreground">Opérateurs:</span>
                      <span className="text-foreground">{campaign.assignedAgents}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="p-12 text-center border border-dashed border-border rounded-lg bg-card/50">
          <Megaphone className="w-8 h-8 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-serif mb-2">Aucune opération</h3>
          <p className="text-muted-foreground font-mono text-sm">Le tableau de bord stratégique est vide.</p>
        </div>
      )}
    </div>
  );
}

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}
