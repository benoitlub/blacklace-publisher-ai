import { useQueryClient } from "@tanstack/react-query";
import { getListAgentsQueryKey, useListAgents, useUpdateAgent } from "@workspace/api-client-react";
import { BookOpen, Fingerprint, MessageSquare, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

const AGENT_COLORS: Record<string, string> = {
  Natasha: "#C0392B",
  Marty: "#2980B9",
  Feuch: "#8E44AD",
  Birdy: "#27AE60",
  Clochette: "#F39C12",
  Sofia: "#7F8C8D"
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
        toast({ title: "Agent mis a jour", description: "Le statut a ete modifie." });
      }
    }
  });

  return (
    <div className="w-full max-w-full overflow-hidden space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="mb-2 break-words font-serif text-3xl font-bold tracking-tight text-foreground md:text-4xl">Personnel</h1>
          <p className="font-mono text-sm uppercase tracking-wider text-muted-foreground">Intelligence Artificielle</p>
        </div>
        <Button className="w-full bg-secondary font-mono font-bold text-foreground hover:bg-secondary/80 md:w-auto">
          Recruter
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
          {[...Array(6)].map((_, index) => (
            <Skeleton key={index} className="h-72 w-full bg-secondary" />
          ))}
        </div>
      ) : agents?.length ? (
        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
          {agents.map((agent) => {
            const agentColor = agent.color || AGENT_COLORS[agent.name] || "#FFFFFF";
            const isFallbackAgent = agent.id < 0;

            return (
              <Card key={agent.id} className="relative min-w-0 overflow-hidden border-border bg-card shadow-md md:shadow-lg">
                <div className="absolute left-0 top-0 h-full w-1" style={{ backgroundColor: agentColor }} />

                <CardHeader className="pb-2">
                  <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border font-serif text-lg font-bold"
                        style={{ color: agentColor, backgroundColor: `${agentColor}20` }}
                      >
                        {agent.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <h2 className="mb-1 break-words font-serif text-xl font-bold leading-tight">{agent.name}</h2>
                        <Badge variant="outline" className="max-w-full whitespace-normal break-words bg-secondary font-mono text-[10px] uppercase md:bg-secondary/50">
                          {agent.role}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
                      <span className="font-mono text-xs uppercase text-muted-foreground">
                        {agent.isActive ? "Actif" : "Inactif"}
                      </span>
                      <Switch
                        checked={agent.isActive}
                        onCheckedChange={(checked) => {
                          if (!isFallbackAgent) {
                            updateAgent.mutate({ id: agent.id, data: { isActive: checked } });
                          }
                        }}
                        disabled={isFallbackAgent || updateAgent.isPending}
                        className="data-[state=checked]:bg-primary"
                      />
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="min-w-0 space-y-4">
                  <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
                    <div className="min-w-0 rounded border border-border/50 bg-secondary p-3 md:bg-secondary/30">
                      <div className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        <Fingerprint className="h-3 w-3 shrink-0" /> Signature Vocale
                      </div>
                      <p className="break-words text-sm italic text-foreground/80">{agent.tone}</p>
                    </div>

                    <div className="min-w-0 rounded border border-border/50 bg-secondary p-3 md:bg-secondary/30">
                      <div className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        <BookOpen className="h-3 w-3 shrink-0" /> Directives
                      </div>
                      <p className="break-words text-xs text-foreground/80 md:line-clamp-2">
                        {agent.limits || "Aucune restriction specifique."}
                      </p>
                    </div>
                  </div>

                  {agent.examplePhrases ? (
                    <div className="min-w-0 border-t border-border/50 pt-2">
                      <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        <MessageSquare className="h-3 w-3 shrink-0" /> Interceptions
                      </div>
                      <div className="space-y-2">
                        {agent.examplePhrases
                          .split("\n")
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((phrase, index) => (
                            <div
                              key={`${agent.id}:${index}`}
                              className="min-w-0 break-words rounded-r border-l-2 bg-secondary p-2 font-mono text-sm text-muted-foreground md:bg-black/40"
                              style={{ borderLeftColor: agentColor }}
                            >
                              "{phrase}"
                            </div>
                          ))}
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center md:p-12">
          <Users className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
          <h3 className="mb-2 font-serif text-lg">Agents indisponibles</h3>
          <p className="font-mono text-sm text-muted-foreground">Le fallback serveur doit fournir les agents de base.</p>
        </div>
      )}
    </div>
  );
}
