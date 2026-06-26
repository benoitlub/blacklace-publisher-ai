import { useListConnectors, getListConnectorsQueryKey, useTestConnector } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { Plug, Activity, Key, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { useState } from "react";

const STATUS_COLORS: Record<string, string> = {
  connected: "text-green-500",
  disconnected: "text-muted-foreground",
  error: "text-destructive",
  mock: "text-amber-500",
};

interface ConnectorPreviewItem {
  id: string;
  title: string;
  universe?: string;
  excerpt?: string;
  tags?: string[];
}

interface ConnectorPreviewResult {
  connectorName: string;
  message: string;
  isMock: boolean;
  testedAt?: string;
  preview: ConnectorPreviewItem[];
}

export default function Connectors() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [previewResult, setPreviewResult] = useState<ConnectorPreviewResult | null>(null);
  
  const { data: connectors, isLoading } = useListConnectors({
    query: { queryKey: getListConnectorsQueryKey() }
  });

  const testConnector = useTestConnector({
    mutation: {
      onSuccess: (result, variables) => {
        queryClient.invalidateQueries({ queryKey: getListConnectorsQueryKey() });
        const extended = result as typeof result & { preview?: ConnectorPreviewItem[] };
        if (extended.preview?.length) {
          setPreviewResult({
            connectorName: variables.name,
            message: result.message,
            isMock: result.isMock,
            testedAt: result.testedAt,
            preview: extended.preview,
          });
        } else {
          setPreviewResult(null);
        }

        if (result.success) {
          toast({ title: "Connexion établie", description: result.message });
        } else {
          toast({ title: "Échec de connexion", description: result.message, variant: "destructive" });
        }
      },
      onError: () => {
        setPreviewResult(null);
        toast({ title: "Erreur système", description: "Le test a échoué lamentablement.", variant: "destructive" });
      }
    }
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-serif font-bold text-foreground mb-2 tracking-tight">Infrastructures</h1>
          <p className="text-muted-foreground font-mono text-sm uppercase tracking-wider">Liaisons Extérieures</p>
        </div>
      </div>

      {previewResult && (
        <Card className="bg-card border-primary/30 shadow-md">
          <CardHeader className="border-b border-border/50">
            <CardTitle className="font-serif flex items-center gap-3">
              Aperçu retourné par {previewResult.connectorName}
              <Badge variant={previewResult.isMock ? "outline" : "default"} className="font-mono">
                {previewResult.isMock ? "MOCK" : "RÉEL"}
              </Badge>
            </CardTitle>
            <p className="text-xs font-mono text-muted-foreground">{previewResult.message}</p>
          </CardHeader>
          <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            {previewResult.preview.map((item) => (
              <div key={item.id} className="p-4 border border-border rounded-md bg-secondary/20">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <h3 className="font-serif font-semibold text-lg">{item.title}</h3>
                    {item.universe && <p className="font-mono text-[10px] uppercase text-muted-foreground">{item.universe}</p>}
                  </div>
                </div>
                {item.excerpt && <p className="text-sm text-muted-foreground mb-3">{item.excerpt}</p>}
                {item.tags?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {item.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="font-mono text-[10px] bg-background/50">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-64 w-full bg-secondary" />
          ))}
        </div>
      ) : connectors?.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {connectors.map((connector) => (
            <Card key={connector.name} className="bg-card border-border hover:border-primary/30 transition-colors flex flex-col relative overflow-hidden group">
              <div className={cn(
                "absolute top-0 left-0 w-full h-1",
                connector.status === 'connected' ? 'bg-green-500/50' : 
                connector.status === 'error' ? 'bg-destructive/50' :
                connector.status === 'mock' ? 'bg-amber-500/50' : 'bg-muted'
              )}></div>
              
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-secondary rounded border border-border">
                      <Plug className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-serif">{connector.displayName}</CardTitle>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Activity className={cn("w-3 h-3", STATUS_COLORS[connector.status])} />
                        <span className="font-mono text-[10px] uppercase text-muted-foreground">
                          {connector.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="flex-1 flex flex-col justify-between space-y-4">
                <p className="text-sm text-muted-foreground min-h-[40px]">
                  {connector.description || "Liaison de données non documentée."}
                </p>
                
                <div className="space-y-3 pt-4 border-t border-border/50">
                  <div className="flex items-center gap-1.5 text-muted-foreground font-mono text-[10px] uppercase tracking-wider">
                    <Key className="w-3 h-3" /> Identifiants Requis
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {connector.requiredVars.map(v => (
                      <Badge key={v} variant="outline" className="font-mono text-[10px] bg-secondary/30">
                        {v}
                      </Badge>
                    ))}
                  </div>
                </div>
                
                <div className="pt-4 flex items-center justify-between">
                  <div className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {connector.lastTestedAt 
                      ? format(parseISO(connector.lastTestedAt), "dd MMM yyyy HH:mm", { locale: fr })
                      : "Jamais testé"
                    }
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="font-mono text-xs border-primary/50 text-primary hover:bg-primary/20"
                    onClick={() => testConnector.mutate({ name: connector.name })}
                    disabled={testConnector.isPending}
                  >
                    {testConnector.isPending ? "Ping..." : "Ping"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="p-12 text-center border border-dashed border-border rounded-lg bg-card/50">
          <Plug className="w-8 h-8 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-serif mb-2">Aucune liaison</h3>
          <p className="text-muted-foreground font-mono text-sm">Le système est isolé.</p>
        </div>
      )}
    </div>
  );
}

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}
