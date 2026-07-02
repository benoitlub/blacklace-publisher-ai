import { useState } from "react";
import { useListConnectors, getListConnectorsQueryKey, useTestConnector } from "@workspace/api-client-react";
import type { ConnectorTestResult } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { Plug, Activity, Key, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

const STATUS_COLORS: Record<string, string> = {
  connected: "text-green-500",
  disconnected: "text-muted-foreground",
  error: "text-destructive",
  mock: "text-amber-500",
};

function RealMockIndicator({ result }: { readonly result: ConnectorTestResult | undefined }) {
  if (!result) return null;
  const isError = !result.success || (!!result.error && !result.source);
  const dot = isError ? "bg-destructive" : result.isMock ? "bg-amber-500" : "bg-green-500";
  const label = isError ? "Erreur" : result.isMock ? "Mock" : "Réel";
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
      <span className="font-mono text-[10px] uppercase text-muted-foreground">{label}</span>
    </div>
  );
}

export default function Connectors() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [lastResults, setLastResults] = useState<Record<string, ConnectorTestResult>>({});
  const [draftSettings, setDraftSettings] = useState<Record<string, Record<string, string>>>({});

  const { data: connectors, isLoading } = useListConnectors({
    query: { queryKey: getListConnectorsQueryKey() }
  });

  const testConnector = useTestConnector({
    mutation: {
      onSuccess: (result, variables) => {
        queryClient.invalidateQueries({ queryKey: getListConnectorsQueryKey() });
        setLastResults((prev) => ({ ...prev, [variables.name]: result }));
        if (result.success) {
          toast({ title: "Connexion établie", description: result.message });
        } else {
          toast({ title: "Échec de connexion", description: result.message, variant: "destructive" });
        }
      },
      onError: () => {
        toast({ title: "Erreur système", description: "Le test a échoué lamentablement.", variant: "destructive" });
      }
    }
  });

  const updateDraftValue = (connectorName: string, fieldName: string, value: string) => {
    setDraftSettings((current) => ({
      ...current,
      [connectorName]: {
        ...(current[connectorName] ?? {}),
        [fieldName]: value
      }
    }));
  };

  const saveConnectorSettings = async (connectorName: string) => {
    const response = await fetch(`/api/connectors/${connectorName}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draftSettings[connectorName] ?? {})
    });
    if (!response.ok) {
      toast({ title: "Configuration refusee", description: "Les parametres n'ont pas ete enregistres.", variant: "destructive" });
      return;
    }

    await queryClient.invalidateQueries({ queryKey: getListConnectorsQueryKey() });
    toast({ title: "Configuration enregistree", description: "Les valeurs sont stockees cote serveur." });
  };

  const clearConnectorSettings = async (connectorName: string) => {
    await fetch(`/api/connectors/${connectorName}/settings`, { method: "DELETE" });
    setDraftSettings((current) => ({ ...current, [connectorName]: {} }));
    await queryClient.invalidateQueries({ queryKey: getListConnectorsQueryKey() });
    toast({ title: "Configuration supprimee", description: "Les valeurs serveur ont ete effacees." });
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-serif font-bold text-foreground mb-2 tracking-tight">Infrastructures</h1>
          <p className="text-muted-foreground font-mono text-sm uppercase tracking-wider">Liaisons Extérieures</p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-64 w-full bg-secondary" />
          ))}
        </div>
      ) : connectors?.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {connectors.map((connector) => {
            const extendedConnector = connector as typeof connector & {
              fields?: Array<{ name: string; label: string; sensitive?: boolean }>;
              settings?: {
                values?: Record<string, string>;
                secrets?: Record<string, { configured: boolean; last4?: string }>;
              } | null;
            };
            return (
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
                  <RealMockIndicator result={lastResults[connector.name]} />
                </div>
              </CardHeader>
              
              <CardContent className="flex-1 flex flex-col justify-between space-y-4">
                <p className="text-sm text-muted-foreground min-h-[40px]">
                  {connector.description || "Liaison de données non documentée."}
                </p>

                {lastResults[connector.name] && (
                  <div className="rounded-md border border-border bg-secondary/20 p-3 space-y-1">
                    <p className="text-xs text-foreground font-mono">{lastResults[connector.name].message}</p>
                    {lastResults[connector.name].source && (
                      <p className="text-[11px] font-mono text-muted-foreground">
                        Source : {lastResults[connector.name].title ?? lastResults[connector.name].source}
                        {typeof lastResults[connector.name].charCount === "number"
                          ? ` · ${lastResults[connector.name].charCount} caractères`
                          : ""}
                        {typeof lastResults[connector.name].sectionCount === "number"
                          ? ` · ${lastResults[connector.name].sectionCount} section(s)`
                          : ""}
                      </p>
                    )}
                    {lastResults[connector.name].error && (
                      <p className="text-[11px] font-mono text-destructive">{lastResults[connector.name].error}</p>
                    )}
                  </div>
                )}

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

                {extendedConnector.fields && extendedConnector.fields.length > 0 ? (
                  <div className="space-y-3 pt-4 border-t border-border/50">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Configurer</p>
                    {extendedConnector.fields.map((field) => {
                      const existingValue = extendedConnector.settings?.values?.[field.name] ?? "";
                      const secret = extendedConnector.settings?.secrets?.[field.name];
                      return (
                        <div key={field.name} className="space-y-1">
                          <Label className="text-[11px] font-mono text-muted-foreground">{field.label}</Label>
                          <Input
                            type={field.sensitive ? "password" : "text"}
                            placeholder={field.sensitive && secret?.configured ? `Configure - ${secret.last4}` : field.label}
                            defaultValue={field.sensitive ? "" : existingValue}
                            onChange={(event) => updateDraftValue(connector.name, field.name, event.target.value)}
                            className="bg-secondary/40 border-border"
                          />
                          {field.sensitive ? (
                            <p className="text-[10px] font-mono text-muted-foreground">
                              {secret?.configured ? `Secret serveur configure, fin : ${secret.last4}` : "Secret absent cote serveur."}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={() => saveConnectorSettings(connector.name)} className="font-mono">
                        Enregistrer
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => clearConnectorSettings(connector.name)} className="font-mono">
                        Supprimer
                      </Button>
                    </div>
                  </div>
                ) : null}
                
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
          );
          })}
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
