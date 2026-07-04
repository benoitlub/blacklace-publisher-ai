import { useEffect, useState } from "react";
import { Check, Copy, FileText, Pencil, Send, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { loadGardenReport, runGardenWorker, type GardenReport } from "@/lib/gardenWorker";
import {
  createPublicationDraftFromHarvest,
  loadHarvestDrafts,
  loadPublicationDrafts,
  prepareHarvestDraft,
  promoteFirstSeedToWip,
  recordActivity,
  updatePublicationDraft,
  type HarvestDraft,
  type MissionParcel,
  type PublicationDraft
} from "@/lib/missions";
import { getArchivedParcelLabel, getParcelDisplayName, loadParcels } from "@/lib/parcels";

export function GardenReportPanel() {
  const [report, setReport] = useState<GardenReport | null>(null);
  const [harvestDrafts, setHarvestDrafts] = useState<HarvestDraft[]>([]);
  const [publicationDrafts, setPublicationDrafts] = useState<PublicationDraft[]>([]);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [generatingHarvestId, setGeneratingHarvestId] = useState<string | null>(null);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  useEffect(() => {
    setReport(loadGardenReport());
    setHarvestDrafts(loadHarvestDrafts());
    setPublicationDrafts(loadPublicationDrafts());
  }, []);

  const refreshGardenState = () => {
    setReport(runGardenWorker());
    setHarvestDrafts(loadHarvestDrafts());
    setPublicationDrafts(loadPublicationDrafts());
  };

  const handleRunWorker = () => {
    setProgressMessage("Octopus analyse...");
    refreshGardenState();
    setActionMessage("Rapport du jardin mis a jour.");
  };

  const applyRecommendation = (parcel: MissionParcel, recommendation: string) => {
    setActionMessage(null);
    setProgressMessage("Octopus analyse...");

    if (isPromoteRecommendation(recommendation)) {
      promoteFirstSeedToWip(parcel);
      refreshGardenState();
      setActionMessage("Graine promue en WIP.");
      return;
    }

    if (isHarvestRecommendation(recommendation)) {
      setProgressMessage("Octopus prepare une recolte...");
      const draft = prepareHarvestDraft(parcel);
      refreshGardenState();
      setActionMessage(draft ? `Recolte preparee : ${draft.title}` : "Aucune pousse WIP disponible pour preparer une recolte.");
      recordActivity({
        type: "recommendation-applied",
        label: "Recommandation appliquee",
        detail: recommendation
      });
    }
  };

  const generatePublication = async (draft: HarvestDraft) => {
    setGeneratingHarvestId(draft.id);
    setActionMessage(null);
    setProgressMessage("Octopus consulte la source de connaissance...");
    await Promise.resolve();
    setProgressMessage("Octopus genere une publication...");

    try {
      await createPublicationDraftFromHarvest(draft, "Instagram");
      setPublicationDrafts(loadPublicationDrafts());
      setActionMessage("PublicationDraft genere.");
    } finally {
      setGeneratingHarvestId(null);
    }
  };

  const startEditing = (draft: PublicationDraft) => {
    setEditingDraftId(draft.id);
    setEditingText(draft.text);
  };

  const saveEditing = (draft: PublicationDraft) => {
    setPublicationDrafts(updatePublicationDraft(draft.id, { text: editingText }));
    setEditingDraftId(null);
    setEditingText("");
  };

  const updateStatus = (draft: PublicationDraft, status: PublicationDraft["status"]) => {
    setPublicationDrafts(updatePublicationDraft(draft.id, { status }));
  };

  const copyDraft = async (draft: PublicationDraft) => {
    await navigator.clipboard?.writeText(draft.text);
    setActionMessage("Publication copiee.");
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

        {progressMessage ? (
          <div className="rounded-md border border-border bg-secondary/30 p-3 text-sm font-mono text-muted-foreground">
            {progressMessage}
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
                  {publicationDrafts
                    .filter((publication) => publication.harvestDraftId === draft.id)
                    .map((publication) => (
                      <Diagnostic key={publication.id} draft={publication} />
                    ))}
                  <p className="text-xs font-mono text-muted-foreground">
                    {new Date(draft.createdAt).toLocaleString("fr-FR")}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => generatePublication(draft)}
                    disabled={generatingHarvestId === draft.id}
                    className="font-mono"
                  >
                    <FileText className="w-4 h-4" />
                    Generer le contenu
                  </Button>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3 border-t border-border/50 pt-4">
          <div>
            <h3 className="font-serif text-lg font-semibold text-foreground">Publications preparees</h3>
            <p className="text-xs font-mono text-muted-foreground">
              PublicationDrafts persistants generes depuis les HarvestDrafts.
            </p>
          </div>

          {publicationDrafts.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-secondary/20 p-4">
              <p className="text-sm font-mono text-muted-foreground">Aucune publication preparee pour l'instant.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {publicationDrafts.map((draft) => (
                <article key={draft.id} className="rounded-md border border-border bg-secondary/20 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-mono uppercase text-muted-foreground">
                        {draft.channel} - source {getSourceLabel(draft.source)}
                      </p>
                      <h4 className="font-serif font-semibold text-foreground">{draft.title}</h4>
                    </div>
                    <span className="rounded border border-border bg-background/40 px-2 py-1 text-[10px] font-mono uppercase text-muted-foreground">
                      {draft.status}
                    </span>
                  </div>

                  {editingDraftId === draft.id ? (
                    <div className="space-y-2">
                      <Textarea value={editingText} onChange={(event) => setEditingText(event.target.value)} />
                      <Button type="button" size="sm" onClick={() => saveEditing(draft)} className="font-mono">
                        <Check className="w-4 h-4" />
                        Enregistrer
                      </Button>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">{draft.text}</p>
                  )}

                  <Diagnostic draft={draft} />

                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => startEditing(draft)} className="font-mono">
                      <Pencil className="w-4 h-4" />
                      Modifier
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => updateStatus(draft, "validated")} className="font-mono">
                      <Check className="w-4 h-4" />
                      Valider
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => copyDraft(draft)} className="font-mono">
                      <Copy className="w-4 h-4" />
                      Copier
                    </Button>
                    <Button type="button" size="sm" onClick={() => updateStatus(draft, "ready-to-publish")} className="font-mono">
                      <Send className="w-4 h-4" />
                      Marquer comme pret a publier
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function Diagnostic({ draft }: { readonly draft: PublicationDraft }) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-3 text-xs font-mono text-muted-foreground">
      <p>provider : {draft.diagnostic.provider}</p>
      <p>knowledgeSource : {draft.diagnostic.knowledgeSource}</p>
      <p>model : {draft.diagnostic.model ?? "non renseigne"}</p>
      {draft.diagnostic.fallbackReason ? <p>fallbackReason : {draft.diagnostic.fallbackReason}</p> : null}
    </div>
  );
}

function getSourceLabel(source: PublicationDraft["source"]): string {
  if (source === "real") {
    return "reel";
  }

  if (source === "error") {
    return "erreur";
  }

  return "mock";
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
