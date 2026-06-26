import { useGetSettings, getGetSettingsQueryKey, useUpdateSettings } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useQueryClient } from "@tanstack/react-query";
import { Settings as SettingsIcon, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useRef } from "react";

export default function Settings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: settings, isLoading } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() }
  });

  const updateSettings = useUpdateSettings({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        toast({ title: "Paramètres sauvegardés", description: "Le noyau a été mis à jour." });
      }
    }
  });

  // Local state for form
  const [formData, setFormData] = useState({
    postsPerWeek: 5,
    autonomyLevel: "manual",
    mainLanguage: "fr",
    globalTone: "",
    notionEnabled: false,
    mistralEnabled: false
  });

  // Sync with server data once
  const initialized = useRef(false);
  useEffect(() => {
    if (settings && !initialized.current) {
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
    updateSettings.mutate({ data: formData });
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-serif font-bold text-foreground mb-2 tracking-tight">Paramètres du Noyau</h1>
          <p className="text-muted-foreground font-mono text-sm uppercase tracking-wider">Configuration Système</p>
        </div>
        <Button 
          onClick={handleSave}
          disabled={updateSettings.isPending || isLoading}
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-mono font-bold"
        >
          <Save className="w-4 h-4 mr-2" />
          Sauvegarder
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-64 w-full bg-secondary" />
          <Skeleton className="h-64 w-full bg-secondary" />
        </div>
      ) : (
        <div className="space-y-6">
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
              <CardDescription className="font-mono text-xs">Activation des sous-systèmes principaux.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              
              <div className="flex items-center justify-between p-4 border border-border rounded-md bg-secondary/20">
                <div className="space-y-1">
                  <h4 className="font-serif font-semibold">Brain: Mistral AI</h4>
                  <p className="text-xs font-mono text-muted-foreground">Moteur cognitif pour la génération de texte.</p>
                </div>
                <Switch 
                  checked={formData.mistralEnabled}
                  onCheckedChange={(c) => setFormData({...formData, mistralEnabled: c})}
                  className="data-[state=checked]:bg-primary"
                />
              </div>

              <div className="flex items-center justify-between p-4 border border-border rounded-md bg-secondary/20">
                <div className="space-y-1">
                  <h4 className="font-serif font-semibold">Memory: Notion</h4>
                  <p className="text-xs font-mono text-muted-foreground">Synchronisation de la base de connaissances.</p>
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
