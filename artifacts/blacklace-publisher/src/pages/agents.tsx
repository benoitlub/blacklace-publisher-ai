import { useListAgents, getListAgentsQueryKey, useUpdateAgent } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useQueryClient } from "@tanstack/react-query";
import { Users, Fingerprint, BookOpen, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Mapped from predefined agents
const AGENT_COLORS: Record<string, string> = {
  Natasha: "#C0392B", // Cramoisi
  Marty: "#2980B9",   // Bleu acier
  Feuch: "#8E44AD",   // Violet
  Birdy: "#27AE60",   // Vert forêt
  Clochette: "#F39C12", // Or
  Sofia: "#7F8C8D"    // Ardoise
};

export default function Agents() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: agents, isLoading } = useListAgents({
    query: { queryKey: getListAgentsQueryKey() }
  });

  const updateAgent = useUpdateAgent({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey() });
        toast({ title: "Agent mis à jour", description: "Le statut a été modifié." });
      }
    }
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-serif font-bold text-foreground mb-2 tracking-tight">Personnel</h1>
          <p className="text-muted-foreground font-mono text-sm uppercase tracking-wider">Intelligence Artificielle</p>
        </div>
        <Button className="bg-secondary hover:bg-secondary/80 text-foreground font-mono font-bold">
          Recruter
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-72 w-full bg-secondary" />
          ))}
        </div>
      ) : agents?.length ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {agents.map((agent) => {
            const agentColor = agent.color || AGENT_COLORS[agent.name] || "#FFFFFF";
            
            return (
              <Card key={agent.id} className="bg-card border-border overflow-hidden relative shadow-lg">
                <div 
                  className="absolute top-0 left-0 w-1 h-full" 
                  style={{ backgroundColor: agentColor }}
                />
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-10 h-10 rounded-full flex items-center justify-center font-serif text-lg font-bold border border-border"
                        style={{ color: agentColor, backgroundColor: `${agentColor}20` }}
                      >
                        {agent.name.charAt(0)}
                      </div>
                      <div>
                        <h2 className="text-xl font-serif font-bold leading-none mb-1">{agent.name}</h2>
                        <Badge variant="outline" className="font-mono text-[10px] uppercase bg-secondary/50">
                          {agent.role}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground uppercase">
                        {agent.isActive ? 'Actif' : 'Inactif'}
                      </span>
                      <Switch 
                        checked={agent.isActive}
                        onCheckedChange={(checked) => updateAgent.mutate({ id: agent.id, data: { isActive: checked } })}
                        disabled={updateAgent.isPending}
                        className="data-[state=checked]:bg-primary"
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-secondary/30 p-3 rounded border border-border/50">
                      <div className="flex items-center gap-1.5 text-muted-foreground font-mono text-[10px] uppercase tracking-wider mb-1">
                        <Fingerprint className="w-3 h-3" /> Signature Vocale
                      </div>
                      <p className="text-sm italic text-foreground/80">{agent.tone}</p>
                    </div>
                    <div className="bg-secondary/30 p-3 rounded border border-border/50">
                      <div className="flex items-center gap-1.5 text-muted-foreground font-mono text-[10px] uppercase tracking-wider mb-1">
                        <BookOpen className="w-3 h-3" /> Directives
                      </div>
                      <p className="text-xs text-foreground/80 line-clamp-2">{agent.limits || "Aucune restriction spécifique."}</p>
                    </div>
                  </div>
                  
                  {agent.examplePhrases && (
                    <div className="pt-2 border-t border-border/50">
                      <div className="flex items-center gap-1.5 text-muted-foreground font-mono text-[10px] uppercase tracking-wider mb-2">
                        <MessageSquare className="w-3 h-3" /> Interceptions
                      </div>
                      <div className="space-y-2">
                        {agent.examplePhrases.split('\n').filter(Boolean).slice(0, 2).map((phrase, i) => (
                          <div key={i} className="text-sm bg-black/40 p-2 rounded-r border-l-2 font-mono text-muted-foreground" style={{ borderLeftColor: agentColor }}>
                            "{phrase}"
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="p-12 text-center border border-dashed border-border rounded-lg bg-card/50">
          <Users className="w-8 h-8 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-serif mb-2">Base de données vide</h3>
          <p className="text-muted-foreground font-mono text-sm">Aucun agent enregistré dans le système.</p>
        </div>
      )}
    </div>
  );
}
