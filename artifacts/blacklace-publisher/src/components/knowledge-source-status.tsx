import { usePreviewKnowledgeSource, getPreviewKnowledgeSourceQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function StatusDot({ status }: { readonly status: "real" | "mock" | "error" }) {
  const color = status === "real" ? "bg-green-500" : status === "mock" ? "bg-amber-500" : "bg-destructive";
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${color}`} />;
}

export function KnowledgeSourceStatus() {
  const { data, isLoading, isError } = usePreviewKnowledgeSource({
    query: { queryKey: getPreviewKnowledgeSourceQueryKey() },
  });

  const status: "real" | "mock" | "error" = isError
    ? "error"
    : data?.connected
      ? "real"
      : "mock";

  return (
    <Card className="bg-card border-border shadow-md">
      <CardHeader className="border-b border-border/50 pb-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="font-serif">Source de connaissance</CardTitle>
            <CardDescription className="font-mono text-xs">
              Dernière source utilisée pour la génération de contenu (Notion / mock).
            </CardDescription>
          </div>
          {!isLoading && (
            <div className="flex items-center gap-2">
              <StatusDot status={status} />
              <span className="font-mono text-[10px] uppercase text-muted-foreground">
                {status === "real" ? "Réel (Notion)" : status === "error" ? "Erreur" : "Mock"}
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-2">
        {isLoading ? (
          <Skeleton className="h-16 w-full bg-secondary" />
        ) : data ? (
          <>
            <p className="text-sm text-foreground">
              {data.title ?? "Aucune source identifiée"}
            </p>
            <p className="text-xs font-mono text-muted-foreground">
              {data.sectionCount} section(s) · {data.charCount} caractères
            </p>
            {data.error && (
              <p className="text-xs font-mono text-destructive">{data.error}</p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Impossible de charger la source de connaissance.</p>
        )}
      </CardContent>
    </Card>
  );
}
