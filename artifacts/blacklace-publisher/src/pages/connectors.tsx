import { useListConnectors, getListConnectorsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plug, Activity, Key, Clock, Settings2, ShieldAlert, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { useEffect, useMemo, useState } from "react";
import {
  clearConnectorSetting,
  hasLocalConnectorValues,
  loadConnectorSettings,
  updateConnectorSetting,
  type ConnectorMode,
  type ConnectorSettingValues,
  type ConnectorSettings,
  type KnowledgeConnectorType
} from "@/lib/connectorSettings";

const STATUS_COLORS: Record<string, string> = {
  connected: "text-green-500",
  disconnected: "text-muted-foreground",
  error: "text-destructive",
  mock: "text-amber-500",
  local: "text-primary",
  server: "text-green-500"
};

interface ConnectorView {
  name: string;
  displayName: string;
  description?: string | null;
  status: string;
  requiredVars: string[];
  lastTestedAt?: string | null;
}

const AI_GATEWAY_CONNECTOR: ConnectorView = {
  name: "ai-gateway",
  displayName: "AI Gateway",
  description: "Capability serveur utilisee par Octopus pour router les taches IA vers mock ou providers configures.",
  status: "mock",
  requiredVars: ["MISTRAL_API_KEY"]
};

export default function Connectors() {
  const { toast } = useToast();
  const [connectorSettings, setConnectorSettings] = useState<ConnectorSettings>({});
  const [openConnectorId, setOpenConnectorId] = useState<string | null>(null);

  const { data: connectors, isLoading } = useListConnectors({
    query: { queryKey: getListConnectorsQueryKey() }
  });

  useEffect(() => {
    setConnectorSettings(loadConnectorSettings());
  }, []);

  const displayedConnectors = useMemo(() => {
    const baseConnectors = (connectors ?? []) as ConnectorView[];
    if (baseConnectors.some((connector) => connector.name === AI_GATEWAY_CONNECTOR.name)) {
      return baseConnectors;
    }

    return [AI_GATEWAY_CONNECTOR, ...baseConnectors];
  }, [connectors]);

  const updateSetting = (connectorId: string, values: ConnectorSettingValues) => {
    setConnectorSettings(updateConnectorSetting(connectorId, values));
  };

  const clearSetting = (connectorId: string) => {
    setConnectorSettings(clearConnectorSetting(connectorId));
    toast({ title: "Configuration locale effacee", description: "Le connecteur revient en mode mock." });
  };

  const pingConnector = (connector: ConnectorView) => {
    const setting = connectorSettings[connector.name];
    const mode = setting?.mode ?? "mock";

    if (mode === "mock" || !hasLocalConnectorValues(setting)) {
      toast({ title: `${connector.displayName} : mock actif`, description: "Aucun appel externe n'a ete effectue." });
      return;
    }

    toast({
      title: `${connector.displayName} : test serveur indisponible en v0.1`,
      description: "Les tests reels doivent passer par le serveur, sans cle dans le frontend."
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-serif font-bold text-foreground mb-2 tracking-tight">Infrastructures</h1>
          <p className="text-muted-foreground font-mono text-sm uppercase tracking-wider">Liaisons Exterieures</p>
        </div>
      </div>

      <Card className="bg-card border-amber-500/30">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-500 mt-0.5" />
            <div className="space-y-1">
              <p className="font-mono text-xs uppercase text-amber-500">Securite des secrets</p>
              <p className="text-sm text-muted-foreground">
                Les cles reelles doivent etre configurees cote serveur/Render, pas dans le frontend. Cette v0.1 locale
                accepte uniquement des valeurs mock, des identifiants non sensibles et des modes de test.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-64 w-full bg-secondary" />
          ))}
        </div>
      ) : displayedConnectors.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {displayedConnectors.map((connector) => {
            const setting = connectorSettings[connector.name];
            const localStatus = getLocalStatus(setting);
            const isOpen = openConnectorId === connector.name;

            return (
              <Card key={connector.name} className="bg-card border-border hover:border-primary/30 transition-colors flex flex-col relative overflow-hidden group">
                <div className={cn(
                  "absolute top-0 left-0 w-full h-1",
                  localStatus === "server" ? "bg-green-500/50" :
                  localStatus === "local" ? "bg-primary/50" :
                  connector.status === "error" ? "bg-destructive/50" :
                  "bg-amber-500/50"
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
                          <Activity className={cn("w-3 h-3", STATUS_COLORS[localStatus])} />
                          <span className="font-mono text-[10px] uppercase text-muted-foreground">
                            {formatLocalStatus(localStatus)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 flex flex-col justify-between space-y-4">
                  <p className="text-sm text-muted-foreground min-h-[40px]">
                    {connector.description || "Liaison de donnees non documentee."}
                  </p>

                  <div className="space-y-3 pt-4 border-t border-border/50">
                    <div className="flex items-center gap-1.5 text-muted-foreground font-mono text-[10px] uppercase tracking-wider">
                      <Key className="w-3 h-3" /> Variables serveur
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {connector.requiredVars.map((variableName) => (
                        <Badge key={variableName} variant="outline" className="font-mono text-[10px] bg-secondary/30">
                          {variableName}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {isOpen ? (
                    <ConnectorConfiguration
                      connectorId={connector.name}
                      values={setting ?? {}}
                      onChange={(values) => updateSetting(connector.name, values)}
                      onClear={() => clearSetting(connector.name)}
                    />
                  ) : null}

                  <div className="pt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {connector.lastTestedAt
                        ? format(parseISO(connector.lastTestedAt), "dd MMM yyyy HH:mm", { locale: fr })
                        : "Test local uniquement"
                      }
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="font-mono text-xs"
                        onClick={() => setOpenConnectorId(isOpen ? null : connector.name)}
                      >
                        <Settings2 className="w-3 h-3" />
                        Configurer
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="font-mono text-xs border-primary/50 text-primary hover:bg-primary/20"
                        onClick={() => pingConnector(connector)}
                      >
                        Ping
                      </Button>
                    </div>
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
          <p className="text-muted-foreground font-mono text-sm">Le systeme est isole.</p>
        </div>
      )}
    </div>
  );
}

function ConnectorConfiguration({
  connectorId,
  values,
  onChange,
  onClear
}: {
  readonly connectorId: string;
  readonly values: ConnectorSettingValues;
  readonly onChange: (values: ConnectorSettingValues) => void;
  readonly onClear: () => void;
}) {
  const update = (nextValues: ConnectorSettingValues) => onChange({ ...values, ...nextValues });

  return (
    <div className="space-y-4 rounded-md border border-border bg-secondary/20 p-3">
      <p className="font-mono text-[10px] uppercase text-muted-foreground">Configuration locale v0.1</p>
      {renderConnectorFields(connectorId, values, update)}
      {renderSecretNotice(connectorId)}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" className="font-mono text-xs" onClick={onClear}>
          <Trash2 className="w-3 h-3" />
          Effacer
        </Button>
      </div>
    </div>
  );
}

function renderConnectorFields(
  connectorId: string,
  values: ConnectorSettingValues,
  update: (values: ConnectorSettingValues) => void
) {
  switch (connectorId) {
    case "github":
      return (
        <div className="space-y-3">
          <TextField label="Repo cible" value={values.repositoryFullName} placeholder="benoitlub/blacklace-publisher-ai" onChange={(repositoryFullName) => update({ repositoryFullName })} />
          <TextField label="Branche" value={values.branch} placeholder="main" onChange={(branch) => update({ branch })} />
          <ModeField value={values.mode ?? "mock"} options={["mock", "read-only", "server"]} onChange={(mode) => update({ mode })} />
        </div>
      );
    case "notion":
      return (
        <div className="space-y-3">
          <TextField label="Page Notion" value={values.notionPageId} placeholder="notionPageId" onChange={(notionPageId) => update({ notionPageId })} />
          <TextField label="Base Notion" value={values.notionDatabaseId} placeholder="notionDatabaseId" onChange={(notionDatabaseId) => update({ notionDatabaseId })} />
          <ModeField value={values.mode ?? "mock"} options={["mock", "connected", "server"]} onChange={(mode) => update({ mode })} />
        </div>
      );
    case "ai-gateway":
    case "ai-provider":
      return (
        <div className="space-y-3">
          <ModeField value={values.mode ?? "mock"} options={["mock", "auto", "server"]} onChange={(mode) => update({ mode })} />
          <TextField label="Provider par defaut" value={values.defaultProvider} placeholder="mock ou mistral" onChange={(defaultProvider) => update({ defaultProvider })} />
          <TextField label="API base URL" value={values.apiBaseUrl} placeholder="/api/ai-gateway" onChange={(apiBaseUrl) => update({ apiBaseUrl })} />
        </div>
      );
    case "mistral":
      return (
        <div className="space-y-3">
          <ModeField value={values.mode ?? "mock"} options={["mock", "server"]} onChange={(mode) => update({ mode })} />
          <TextField label="Modele" value={values.model} placeholder="mistral-small-latest" onChange={(model) => update({ model })} />
          <SecretPlaceholder label="Cle Mistral" value="MISTRAL_API_KEY doit etre configuree dans Render" />
        </div>
      );
    case "meta":
      return (
        <div className="space-y-3">
          <ModeField value={values.mode ?? "mock"} options={["mock", "server"]} onChange={(mode) => update({ mode })} />
          <TextField label="Meta Page ID" value={values.metaPageId} placeholder="metaPageId" onChange={(metaPageId) => update({ metaPageId })} />
          <TextField label="Instagram User ID" value={values.metaIgUserId} placeholder="metaIgUserId" onChange={(metaIgUserId) => update({ metaIgUserId })} />
          <SecretPlaceholder label="Token Meta" value="META_ACCESS_TOKEN doit etre configuree dans Render" />
        </div>
      );
    case "knowledge-source":
      return (
        <div className="space-y-3">
          <KnowledgeTypeField value={values.connectorType ?? "mock"} onChange={(connectorType) => update({ connectorType })} />
          <TextField label="Source ID" value={values.sourceId} placeholder="base, fichier, repo ou mock" onChange={(sourceId) => update({ sourceId })} />
        </div>
      );
    default:
      return <ModeField value={values.mode ?? "mock"} options={["mock", "server"]} onChange={(mode) => update({ mode })} />;
  }
}

function renderSecretNotice(connectorId: string) {
  if (connectorId !== "mistral" && connectorId !== "meta" && connectorId !== "github" && connectorId !== "notion") {
    return null;
  }

  return (
    <div className="rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-500">
      Les cles reelles doivent etre configurees cote serveur/Render, pas dans le frontend.
    </div>
  );
}

function TextField({
  label,
  value,
  placeholder,
  onChange
}: {
  readonly label: string;
  readonly value?: string;
  readonly placeholder?: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="font-mono text-[10px] uppercase text-muted-foreground">{label}</Label>
      <Input value={value ?? ""} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function SecretPlaceholder({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="space-y-2">
      <Label className="font-mono text-[10px] uppercase text-muted-foreground">{label}</Label>
      <Input type="password" value={value} disabled />
    </div>
  );
}

function ModeField({
  value,
  options,
  onChange
}: {
  readonly value: ConnectorMode;
  readonly options: readonly ConnectorMode[];
  readonly onChange: (value: ConnectorMode) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="font-mono text-[10px] uppercase text-muted-foreground">Mode</Label>
      <Select value={value} onValueChange={(nextValue) => onChange(nextValue as ConnectorMode)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function KnowledgeTypeField({
  value,
  onChange
}: {
  readonly value: KnowledgeConnectorType;
  readonly onChange: (value: KnowledgeConnectorType) => void;
}) {
  const options: KnowledgeConnectorType[] = ["notion", "markdown", "github", "mock"];

  return (
    <div className="space-y-2">
      <Label className="font-mono text-[10px] uppercase text-muted-foreground">Type de source</Label>
      <Select value={value} onValueChange={(nextValue) => onChange(nextValue as KnowledgeConnectorType)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function getLocalStatus(values: ConnectorSettingValues | undefined): "mock" | "local" | "server" {
  if (values?.mode === "server") {
    return "server";
  }

  return hasLocalConnectorValues(values) ? "local" : "mock";
}

function formatLocalStatus(status: "mock" | "local" | "server"): string {
  if (status === "server") return "SERVER";
  if (status === "local") return "CONFIGURE LOCAL";
  return "MOCK";
}

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}
