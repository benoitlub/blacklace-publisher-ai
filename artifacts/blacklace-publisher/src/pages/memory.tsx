import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain } from "lucide-react";

interface MemorySourceSummary {
  readonly id: string;
  readonly label: string;
  readonly status: "real" | "mock";
  readonly charCount: number;
  readonly syncedAt: string;
  readonly excerpt: string;
}

export default function Memory() {
  const [sources, setSources] = useState<MemorySourceSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void fetch("/api/memory")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Memoire indisponible");
        }
        return response.json() as Promise<{ sources: MemorySourceSummary[] }>;
      })
      .then((payload) => setSources(payload.sources))
      .catch(() => setSources([]))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-4xl font-serif font-bold text-foreground mb-2 tracking-tight">Memoire</h1>
        <p className="text-muted-foreground font-mono text-sm uppercase tracking-wider">Sources utilisees par Publisher AI</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(6)].map((_, index) => (
            <Skeleton key={index} className="h-56 bg-secondary" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {sources.map((source) => (
            <Card key={source.id} className="bg-card border-border shadow-md">
              <CardHeader className="border-b border-border/50">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Brain className="w-5 h-5 text-primary" />
                    <CardTitle className="font-serif">{source.label}</CardTitle>
                  </div>
                  <Badge variant="outline" className="font-mono text-[10px] uppercase">
                    {source.status === "real" ? "reel" : "mock"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-5">
                <div className="grid grid-cols-2 gap-3 text-xs font-mono text-muted-foreground">
                  <div className="rounded border border-border bg-secondary/20 p-2">
                    <p className="uppercase text-[10px]">Caracteres</p>
                    <p className="text-foreground">{source.charCount}</p>
                  </div>
                  <div className="rounded border border-border bg-secondary/20 p-2">
                    <p className="uppercase text-[10px]">Synchro</p>
                    <p className="text-foreground">{new Date(source.syncedAt).toLocaleString("fr-FR")}</p>
                  </div>
                </div>
                <div className="rounded-md border border-border bg-secondary/20 p-3">
                  <p className="text-[10px] font-mono uppercase text-muted-foreground">Extrait utilise</p>
                  <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
                    {source.excerpt || "Aucun extrait disponible pour l'instant."}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
