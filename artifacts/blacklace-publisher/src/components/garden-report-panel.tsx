import { useEffect, useState } from "react";
import { Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadGardenReport, runGardenWorker, type GardenReport } from "@/lib/gardenWorker";
import {
  loadHarvestDrafts,
  prepareHarvestDraft,
  promoteFirstSeedToWip,
  type HarvestDraft,
  type MissionParcel
} from "@/lib/missions";
import { getArchivedParcelLabel, getParcelDisplayName, loadParcels } from "@/lib/parcels";

export function GardenReportPanel() {
  const [report, setReport] = useState<GardenReport | null>(null);
  const [harvestDrafts, setHarvestDrafts] = useState<HarvestDraft[]>([]);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    setReport(loadGardenReport());
    setHarvestDrafts(loadHarvestDrafts());
  }, []);

  const refreshGardenState = () => {
    setReport(runGardenWorker());
    setHarvestDrafts(loadHarvestDrafts());
  };

  const handleRunWorker = () => {
    refreshGardenState();
  };

  const applyRecommendation = (parcel: MissionParcel, recommendation: string) => {
    setActionMessage(null);

    if (isPromoteRecommendation(recommendation)) {
      promoteFirstSeedToWip(parcel);
      refreshGardenState();
      setActionMessage("Graine promue en WIP.");
      return;
    }

    if (isHarvestRecommendation(recommendation)) {
      const draft = prepareHarvestDraft(parcel);
      refreshGardenState();
      setActionMessage(draft ? `Recolte preparee : ${draft.title}` : "Aucune pousse WIP disponible pour preparer une recolte.");
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
        {actionMessage ? (
          <div className="rounded-md border border-primary/40 bg-primary/10 p-3 text-sm font-mono text-foreground">
            {actionMessage}
          </div>
        ) : null}

        {!report ? (
          <div className="p-6 text-center border border-dashed border-border rounded-md bg-secondary/20">
            <p className="text-sm font-mono text-muted-foreground">Aucun rapport genere pour l'instant.</p>
          </div>
        ) : (
          <>
            <p className="text-xs font-mono text-muted-foreground">
              Genere le {new Date(report.generatedAt).toLocaleString("fr-FR")}
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
                        <h3 className="font-serif font-semibold text-foreground">{getParcelDisplayName(parcelReport.parcel, loadParcels())}</h3>
                        {getArchivedParcelLabel(parcelReport.parcel, loadParcels()) ? (
                          <p className="text-[11px] font-mono text-muted-foreground">Ancien libelle : {parcelReport.parcel}</p>
                        ) : null}
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
                        <p className="text-sm text-muted-foreground">Aucune recommandation immediate.</p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}

        <section className="space-y-3 border-t border-border/50 pt-4">
          <div>
            <h3 className="font-serif text-lg font-semibold text-foreground">Recoltes preparees</h3>
            <p className="text-xs font-mono text-muted-foreground">Brouillons visibles crees depuis les recommandations du jardin.</p>
          </div>

          {harvestDrafts.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-secondary/20 p-4">
              <p className="text-sm font-mono text-muted-foreground">Aucune recolte preparee pour l'instant.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {harvestDrafts.map((draft) => (
                <article key={draft.id} className="rounded-md border border-border bg-secondary/20 p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-mono uppercase text-muted-foreground">{draft.parcel}</p>
                      <h4 className="font-serif font-semibold text-foreground">{draft.title}</h4>
                    </div>
                    <span className="rounded border border-border bg-background/40 px-2 py-1 text-[10px] font-mono uppercase text-muted-foreground">
                      {draft.status}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{draft.summary}</p>
                  <p className="text-xs font-mono text-muted-foreground">
                    {new Date(draft.createdAt).toLocaleString("fr-FR")}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
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
  return normalized.includes("recolte") || normalized.includes("récolte") || normalized.includes("rÃ©colte");
}

function Metric({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="rounded border border-border bg-background/40 px-2 py-1">
      <p className="text-sm font-serif text-foreground">{value}</p>
      <p className="text-[10px] font-mono uppercase text-muted-foreground">{label}</p>
    </div>
  );
}
