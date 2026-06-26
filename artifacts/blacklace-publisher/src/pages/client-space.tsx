import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Save, Sparkles, Palette, BookOpen, Share2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ClientProfile {
  clientName: string;
  projectName: string;
  tagline: string;
  mainColor: string;
  tone: string;
  audience: string;
  goals: string;
  platforms: string;
}

const DEFAULT_PROFILE: ClientProfile = {
  clientName: "Feuch Institute",
  projectName: "Blacklace Publisher",
  tagline: "Créer. Le reste est pris en charge.",
  mainColor: "#ff3b1f",
  tone: "Mystérieux, scientifique, sarcastique, poétique",
  audience: "Lecteurs, joueurs, créateurs, curieux",
  goals: "Animer les univers, préparer les posts, réduire la charge éditoriale",
  platforms: "Instagram, Facebook, TikTok, KDP, site web",
};

const STORAGE_KEY = "blacklace-client-profile";

export default function ClientSpace() {
  const { toast } = useToast();
  const [profile, setProfile] = useState<ClientProfile>(DEFAULT_PROFILE);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    try {
      setProfile({ ...DEFAULT_PROFILE, ...JSON.parse(saved) });
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const platformList = useMemo(
    () => profile.platforms.split(",").map((item) => item.trim()).filter(Boolean),
    [profile.platforms],
  );

  const handleSave = () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    toast({ title: "Espace client sauvegardé", description: "La personnalisation locale a été enregistrée." });
  };

  const update = (field: keyof ClientProfile, value: string) => {
    setProfile((current) => ({ ...current, [field]: value }));
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-serif font-bold text-foreground mb-2 tracking-tight">Espace Client</h1>
          <p className="text-muted-foreground font-mono text-sm uppercase tracking-wider">
            Personnalisation du portail éditorial
          </p>
        </div>
        <Button onClick={handleSave} className="bg-primary hover:bg-primary/90 text-primary-foreground font-mono font-bold">
          <Save className="w-4 h-4 mr-2" />
          Sauvegarder
        </Button>
      </div>

      <Card className="bg-card border-border overflow-hidden">
        <div className="h-2" style={{ backgroundColor: profile.mainColor }} />
        <CardContent className="p-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 items-start">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-md border border-border flex items-center justify-center" style={{ color: profile.mainColor }}>
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-3xl font-serif font-bold">{profile.clientName}</h2>
                  <p className="font-mono text-xs text-muted-foreground uppercase tracking-wider">{profile.projectName}</p>
                </div>
              </div>
              <p className="text-xl font-serif italic text-muted-foreground mb-6">{profile.tagline}</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 border border-border rounded-md bg-secondary/20">
                  <BookOpen className="w-4 h-4 mb-3" style={{ color: profile.mainColor }} />
                  <h3 className="font-serif font-semibold mb-1">Ton</h3>
                  <p className="text-xs font-mono text-muted-foreground">{profile.tone}</p>
                </div>
                <div className="p-4 border border-border rounded-md bg-secondary/20">
                  <Palette className="w-4 h-4 mb-3" style={{ color: profile.mainColor }} />
                  <h3 className="font-serif font-semibold mb-1">Audience</h3>
                  <p className="text-xs font-mono text-muted-foreground">{profile.audience}</p>
                </div>
                <div className="p-4 border border-border rounded-md bg-secondary/20">
                  <Share2 className="w-4 h-4 mb-3" style={{ color: profile.mainColor }} />
                  <h3 className="font-serif font-semibold mb-1">Objectifs</h3>
                  <p className="text-xs font-mono text-muted-foreground">{profile.goals}</p>
                </div>
              </div>
            </div>

            <div className="p-4 border border-border rounded-md bg-background/40">
              <h3 className="font-serif text-lg mb-3">Plateformes</h3>
              <div className="flex flex-wrap gap-2">
                {platformList.map((platform) => (
                  <Badge key={platform} variant="outline" className="font-mono bg-secondary/30">
                    {platform}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="font-serif">Réglages client</CardTitle>
          <CardDescription className="font-mono text-xs">
            Première couche visible : chaque client peut renommer, colorer et cadrer son portail sans modifier le moteur.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase text-muted-foreground">Nom du client</Label>
            <Input value={profile.clientName} onChange={(event) => update("clientName", event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase text-muted-foreground">Nom du projet</Label>
            <Input value={profile.projectName} onChange={(event) => update("projectName", event.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label className="font-mono text-xs uppercase text-muted-foreground">Signature</Label>
            <Input value={profile.tagline} onChange={(event) => update("tagline", event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase text-muted-foreground">Couleur principale</Label>
            <Input type="color" value={profile.mainColor} onChange={(event) => update("mainColor", event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase text-muted-foreground">Plateformes</Label>
            <Input value={profile.platforms} onChange={(event) => update("platforms", event.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label className="font-mono text-xs uppercase text-muted-foreground">Ton éditorial</Label>
            <Input value={profile.tone} onChange={(event) => update("tone", event.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label className="font-mono text-xs uppercase text-muted-foreground">Audience</Label>
            <Input value={profile.audience} onChange={(event) => update("audience", event.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label className="font-mono text-xs uppercase text-muted-foreground">Objectifs</Label>
            <Input value={profile.goals} onChange={(event) => update("goals", event.target.value)} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
