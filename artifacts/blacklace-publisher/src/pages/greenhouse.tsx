import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Loader2, PackageCheck, RefreshCw, Sparkles } from "lucide-react";

const API_BASE = String(import.meta.env.VITE_API_BASE_URL || "https://blacklace-publisher-api.onrender.com").replace(/\/$/, "");

type HarvestAsset = {
  id?: string;
  filename?: string;
  mediaType?: string;
  content?: string;
  deliverableKind?: string;
};

type Harvest = {
  id: string;
  parcelId: string;
  parcelName: string;
  knowledgePackageVersion: number;
  status: string;
  assetCount: number;
  assets: HarvestAsset[];
  preparedAt: string;
};

function downloadAsset(asset: HarvestAsset) {
  const blob = new Blob([asset.content || ""], { type: asset.mediaType || "text/plain" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = asset.filename || "livrable.txt";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function Greenhouse() {
  const [harvests, setHarvests] = useState<Harvest[]>([]);
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/deliverables/harvests`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Publisher API ${response.status}`);
      const payload = await response.json();
      setHarvests(Array.isArray(payload) ? payload : []);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Récoltes indisponibles");
    } finally {
      setLoading(false);
    }
  };

  const prepareAll = async () => {
    setPreparing(true);
    try {
      const response = await fetch(`${API_BASE}/api/deliverables/prepare-all`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error(`Préparation impossible (${response.status})`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Préparation impossible");
    } finally {
      setPreparing(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge variant="outline" className="mb-3 gap-2 font-mono uppercase tracking-widest">
            <PackageCheck className="h-3.5 w-3.5" /> Récoltes
          </Badge>
          <h1 className="text-3xl font-serif font-bold tracking-tight sm:text-4xl">Tout ce que Gérard a préparé.</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Chaque parcelle rassemble un ensemble exploitable : landing page, visuels et posts, newsletter et documentation. Les livrables restent groupés par livre ou application.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void refresh()} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualiser
          </Button>
          <Button onClick={() => void prepareAll()} disabled={preparing} className="gap-2">
            {preparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Préparer toutes les récoltes
          </Button>
        </div>
      </header>

      {error ? <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}

      {!loading && !harvests.length ? (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Aucune récolte n’est encore prête. Gérard doit d’abord disposer de Knowledge Packages exploitables pour les livres et les applications.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-5">
        {harvests.map((harvest) => (
          <Card key={harvest.id} className="overflow-hidden border-primary/20">
            <CardHeader className="border-b border-border bg-primary/5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="font-serif text-2xl">{harvest.parcelName}</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">Knowledge Package v{harvest.knowledgePackageVersion} · {new Date(harvest.preparedAt).toLocaleString("fr-FR")}</p>
                </div>
                <Badge>{harvest.assetCount} livrables</Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
              {harvest.assets.map((asset, index) => (
                <div key={`${harvest.id}:${asset.filename || index}`} className="flex flex-col rounded-lg border border-border bg-background/50 p-4">
                  <p className="font-medium">{asset.filename || asset.deliverableKind || "Livrable"}</p>
                  <p className="mt-1 flex-1 text-xs text-muted-foreground">{asset.mediaType || "fichier prêt"}</p>
                  <Button variant="outline" size="sm" className="mt-4 gap-2" onClick={() => downloadAsset(asset)}>
                    <Download className="h-4 w-4" /> Télécharger
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
