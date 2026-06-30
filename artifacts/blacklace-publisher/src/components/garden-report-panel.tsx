import { useEffect, useState } from "react";
import { Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadGardenReport, runGardenWorker, type GardenReport } from "@/lib/gardenWorker";
import { prepareHarvestDraft, promoteFirstSeedToWip, type MissionParcel } from "@/lib/missions";

export function GardenReportPanel() {
  const [report, setReport] = useState<GardenReport | null>(null);

  useEffect(() => {
    setReport(loadGardenReport());
  }, []);

  const handleRunWorker = () => {
    setReport(runGardenWorker());
  };

  const applyRecommendation = (parcel: MissionParcel, recommendation: string) => {
    if (isPromoteRecommendation(recommendation)) {
      promoteFirstSeedToWip(parcel);
      setReport(runGardenWorker());
      return;
    }

    if (isHarvestRecommendation(recommendation)) {
      prepareHarvestDraft(parcel);
      setReport(runGardenWorker());
    }
  };

  return (
    <Card className="bg-card border-border shadow-md">
      <CardHeader className="border-b border-border/50 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="font-serif">Rapport du jardin</CardTitle>
            <CardDescription className="font-mono text-xs">
              Lecture locale des missions, graines et WIP par parcelle.
            </CardDescription>
          </div>
          <Button type="button" onClick={handleRunWorker} className="font-mono font-bold">
            <Sprout className="w-4 h-4" />
            Faire jardiner le Poulpe
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-6">
        {!report ? (
          <div className="p-6 text-center border border-dashed border-border rounded-md bg-secondary/20">
            <p className="text-sm font-mono text-muted-foreground">Aucun rapport généré pour l'instant.</p>
          </div>
        ) : (
          <>
            <p className="text-xs font-mono text-muted-foreground">
              Généré le {new Date(report.generatedAt).toLocaleString("fr-FR")}
            </p>

            {report.globalRecommendations.length > 0 ? (
              <div className="rounded-md border border-border bg-secondary/20 p-3">
                <p className="text-[11px] font-mono uppercase text-muted-foreground">Recommandations globales</p>
                <ul className="mt-2 list-disc pl-4 text-sm text-muted-foreground">
                  {report.globalRecommendations.map((recommendation) => (
                    <li key={recommendation}>{recommendation}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {report.parcels.length === 0 ? (
              <div className="rounded-md border border-border bg-secondary/20 p-3">
                <p className="text-sm text-muted-foreground">Aucune parcelle active.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {report.parcels.map((parcelReport) => (
                  <article key={parcelReport.parcel} className="rounded-md border border-border bg-secondary/20 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-serif font-semibold text-foreground">{parcelReport.parcel}</h3>
                        <p className="text-xs font-mono text-muted-foreground">
                          {parcelReport.totalMissions} mission(s)
                        </p>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <Metric label="Seed" value={parcelReport.seedsCount} />
                        <Metric label="WIP" value={parcelReport.wipCount} />
                        <Metric label="Harvest" value={parcelReport.harvestReadyCount} />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="text-[11px] font-mono uppercase text-muted-foreground">Recommandations</p>
                      {parcelReport.recommendations.length > 0 ? (
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          {parcelReport.recommendations.map((recommendation) => (
                            <li key={recommendation} className="flex items-start justify-between gap-3">
                              <span>{recommendation}</span>
                              {isActionableRecommendation(recommendation) ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => applyRecommendation(parcelReport.parcel, recommendation)}
                                  className="shrink-0 font-mono"
                                >
                                  Appliquer la recommandation
                                </Button>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground">Aucune recommandation immédiate.</p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function isActionableRecommendation(recommendation: string): boolean {
  return isPromoteRecommendation(recommendation) || isHarvestRecommendation(recommendation);
}

function isPromoteRecommendation(recommendation: string): boolean {
  return recommendation.toLowerCase().includes("wip");
}

function isHarvestRecommendation(recommendation: string): boolean {
  const normalized = recommendation.toLowerCase();
  return normalized.includes("recolte") || normalized.includes("rÃ©colte");
}

function Metric({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="rounded border border-border bg-background/40 px-2 py-1">
      <p className="text-sm font-serif text-foreground">{value}</p>
      <p className="text-[10px] font-mono uppercase text-muted-foreground">{label}</p>
    </div>
  );
}
