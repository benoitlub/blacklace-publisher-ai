import { useGetSettings, getGetSettingsQueryKey, useUpdateSettings } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useQueryClient } from "@tanstack/react-query";
import { Brain, Database, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useRef } from "react";

const SETTINGS_STORAGE_KEY = "blacklace-publisher-settings-draft";

interface SettingsFormData {
  postsPerWeek: number;
  autonomyLevel: string;
  mainLanguage: string;
  globalTone: string;
  notionEnabled: boolean;
  mistralEnabled: boolean;
}

const DEFAULT_FORM_DATA: SettingsFormData = {
  postsPerWeek: 5,
  autonomyLevel: "manual",
  mainLanguage: "fr",
  globalTone: "",
  notionEnabled: false,
  mistralEnabled: false,
};

export default function Settings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: settings, isLoading } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() }
  });

  const [formData, setFormData] = useState<SettingsFormData>(DEFAULT_FORM_DATA);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const updateSettings = useUpdateSettings({
    mutation: {
      onSuccess: (savedSettings) => {
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        const nextData = {
          postsPerWeek: savedSettings.postsPerWeek || 5,
          autonomyLevel: savedSettings.autonomyLevel || "manual",
          mainLanguage: savedSettings.mainLanguage || "fr",
          globalTone: savedSettings.globalTone || "",
          notionEnabled: savedSettings.notionEnabled || false,
          mistralEnabled: savedSettings.mistralEnabled || false,
        };
        setFormData(nextData);
        window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(nextData));
        setLastSavedAt(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
        toast({ title: "Paramètres sauvegardés", description: "Le noyau a été mis à jour." });
      },
      onError: () => {
        window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(formData));
        toast({
          title: "Sauvegarde locale effectuée",
          description: "Le serveur n'a pas confirmé. Le navigateur garde ces choix pour la démo.",
          variant: "destructive",
        });
      }
    }
  });

  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;

    const savedDraft = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (savedDraft) {
      try {
        setFormData({ ...DEFAULT_FORM_DATA, ...JSON.parse(savedDraft) });
        initialized.current = true;
        return;
      } catch {
        window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
      }
    }

    if (settings) {
      setFormData({
        postsPerWeek: settings.postsPerWeek || 5,
        autonomyLevel: settings.autonomyLevel || "manual",
        mainLanguage: settings.mainLanguage || "fr",
        globalTone: settings.globalTone || "",
        notionEnabled: settings.notionEnabled || false,
        mistralEnabled: settings.mistralEnabled || false
      });
      initialized.current = true;
    }
  }, [settings]);

  const handleSave = () => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(formData));
    setLastSavedAt(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
    updateSettings.mutate({ data: formData });
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-serif font-bold text-foreground mb-2 tracking-tight">Paramètres du Noyau</h1>
          <p className="text-muted-foreground font-mono text-sm uppercase tracking-wider">Configuration Système</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button 
            onClick={handleSave}
            disabled={updateSettings.isPending || isLoading}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-mono font-bold"
          >
            <Save className="w-4 h-4 mr-2" />
            {updateSettings.isPending ? "Sauvegarde..." : "Sauvegarder"}
          </Button>
          {lastSavedAt && (
            <span className="text-[10px] font-mono text-muted-foreground">Dernière sauvegarde visible : {lastSavedAt}</span>
          )}
        </div>
      </div>

      {isLoading && !initialized.current ? (
        <div className="space-y-6">
          <Skeleton className="h-64 w-full bg-secondary" />
          <Skeleton className="h-64 w-full bg-secondary" />
        </div>
      ) : (
        <div className="space-y-6">
          <Card className="bg-card border-border shadow-md">
            <CardHeader className="border-b border-border/50 pb-4">
              <CardTitle className="font-serif">État visible</CardTitle>
              <CardDescription className="font-mono text-xs">Ce bloc confirme les choix actifs dans le portail. Les vraies clés restent dans Render.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-6">
              <div className="p-4 border border-border rounded-md bg-secondary/20 flex items-start gap-3">
                <Brain className="w-5 h-5 text-primary mt-1" />
                <div>
                  <h3 className="font-serif font-semibold">Brain: AI Provider</h3>
                  <p className="text-xs font-mono text-muted-foreground mb-2">Choix dans l'interface : {formData.mistralEnabled ? "activé" : "désactivé"}</p>
                  <Badge variant={formData.mistralEnabled ? "default" : "outline"} className="font-mono">
                    {formData.mistralEnabled ? "Sélectionné" : "Non sélectionné"}
                  </Badge>
                </div>
              </div>
              <div className="p-4 border border-border rounded-md bg-secondary/20 flex items-start gap-3">
                <Database className="w-5 h-5 text-primary mt-1" />
                <div>
                  <h3 className="font-serif font-semibold">Memory: Knowledge Source</h3>
                  <p className="text-xs font-mono text-muted-foreground mb-2">Choix dans l'interface : {formData.notionEnabled ? "activé" : "désactivé"}</p>
                  <Badge variant={formData.notionEnabled ? "default" : "outline"} className="font-mono">
                    {formData.notionEnabled ? "Sélectionné" : "Non sélectionné"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-md">
            <CardHeader className="border-b border-border/50 pb-4">
              <CardTitle className="font-serif">Comportement Éditorial</CardTitle>
              <CardDescription className="font-mono text-xs">Directives globales pour l'intelligence artificielle.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <Label className="font-mono text-xs uppercase text-muted-foreground">Volume Hebdomadaire</Label>
                  <div className="flex items-center gap-4">
                    <Input 
                      type="number" 
                      min="1" max="50"
                      className="bg-secondary/50 border-border font-mono w-24"
                      value={formData.postsPerWeek}
                      onChange={(e) => setFormData({...formData, postsPerWeek: Number(e.target.value)})}
                    />
                    <span className="font-mono text-sm text-muted-foreground">Publications / Semaine</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="font-mono text-xs uppercase text-muted-foreground">Langue Principale</Label>
                  <Input 
                    className="bg-secondary/50 border-border font-mono"
                    value={formData.mainLanguage}
                    onChange={(e) => setFormData({...formData, mainLanguage: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label className="font-mono text-xs uppercase text-muted-foreground">Ton Global</Label>
                <Input 
                  className="bg-secondary/50 border-border font-serif italic"
                  value={formData.globalTone}
                  placeholder="Ex: Mystérieux, scientifique, sarcastique..."
                  onChange={(e) => setFormData({...formData, globalTone: e.target.value})}
                />
              </div>

              <div className="space-y-3 pt-4">
                <Label className="font-mono text-xs uppercase text-muted-foreground mb-4 block">Niveau d'Autonomie</Label>
                <RadioGroup 
                  value={formData.autonomyLevel} 
                  onValueChange={(val) => setFormData({...formData, autonomyLevel: val})}
                  className="grid grid-cols-1 md:grid-cols-3 gap-4"
                >
                  <div className="flex flex-col space-y-2 border border-border p-4 rounded-md bg-secondary/20 has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5 transition-colors">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="manual" id="r-manual" />
                      <Label htmlFor="r-manual" className="font-serif font-bold">Manuel</Label>
                    </div>
                    <p className="text-xs font-mono text-muted-foreground pl-6">Validation requise pour chaque post.</p>
                  </div>
                  
                  <div className="flex flex-col space-y-2 border border-border p-4 rounded-md bg-secondary/20 has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5 transition-colors">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="semi-auto" id="r-semi" />
                      <Label htmlFor="r-semi" className="font-serif font-bold">Semi-Auto</Label>
                    </div>
                    <p className="text-xs font-mono text-muted-foreground pl-6">Validation uniquement pour les campagnes.</p>
                  </div>
                  
                  <div className="flex flex-col space-y-2 border border-border p-4 rounded-md bg-secondary/20 has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5 transition-colors">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="auto" id="r-auto" />
                      <Label htmlFor="r-auto" className="font-serif font-bold text-destructive">Autonome</Label>
                    </div>
                    <p className="text-xs font-mono text-muted-foreground pl-6 text-destructive/80">Publication directe. Risqué.</p>
                  </div>
                </RadioGroup>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-md">
            <CardHeader className="border-b border-border/50 pb-4">
              <CardTitle className="font-serif">Modules Moteurs</CardTitle>
              <CardDescription className="font-mono text-xs">Ces boutons choisissent les modules pour le portail. La connexion réelle se vérifie dans Connecteurs.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              
              <div className="flex items-center justify-between p-4 border border-border rounded-md bg-secondary/20">
                <div className="space-y-1">
                  <h4 className="font-serif font-semibold">Brain: AI Provider</h4>
                  <p className="text-xs font-mono text-muted-foreground">Moteur cognitif interchangeable : mock, Mistral, OpenAI, Anthropic, Gemini, Ollama ou autre API.</p>
                </div>
                <Switch 
                  checked={formData.mistralEnabled}
                  onCheckedChange={(c) => setFormData({...formData, mistralEnabled: c})}
                  className="data-[state=checked]:bg-primary"
                />
              </div>

              <div className="flex items-center justify-between p-4 border border-border rounded-md bg-secondary/20">
                <div className="space-y-1">
                  <h4 className="font-serif font-semibold">Memory: Knowledge Source</h4>
                  <p className="text-xs font-mono text-muted-foreground">Source de connaissance interchangeable : Notion, Markdown, GitHub, Drive, PDF, DOCX ou API client.</p>
                </div>
                <Switch 
                  checked={formData.notionEnabled}
                  onCheckedChange={(c) => setFormData({...formData, notionEnabled: c})}
                  className="data-[state=checked]:bg-primary"
                />
              </div>

            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
