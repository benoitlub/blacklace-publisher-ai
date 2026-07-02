import { useEffect, useState } from "react";
import { SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createMission,
  loadMissions,
  recordActivity,
  saveMissions,
  submitMissionToOctopus,
  type ClientMission,
  type MissionParcel,
  type MissionPersona
} from "@/lib/missions";
import {
  getArchivedParcelLabel,
  getParcelDisplayName,
  loadParcels,
  PARCELS_CHANGED_EVENT,
  type Parcel
} from "@/lib/parcels";

const personas: MissionPersona[] = ["neutre", "conseiller marketing", "assistant commercial"];

export function MissionPanel() {
  const [intent, setIntent] = useState("");
  const [parcel, setParcel] = useState<MissionParcel>("Yael Bali");
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [persona, setPersona] = useState<MissionPersona>("neutre");
  const [missions, setMissions] = useState<ClientMission[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setMissions(loadMissions());

    const refreshParcels = () => {
      const nextParcels = loadParcels();
      setParcels(nextParcels);
      setParcel((currentParcel) => {
        if (nextParcels.some((item) => item.name === currentParcel)) {
          return currentParcel;
        }

        return nextParcels[0]?.name ?? currentParcel;
      });
    };

    refreshParcels();
    window.addEventListener(PARCELS_CHANGED_EVENT, refreshParcels);
    return () => window.removeEventListener(PARCELS_CHANGED_EVENT, refreshParcels);
  }, []);

  const handleSubmit = async () => {
    const trimmedIntent = intent.trim();
    if (!trimmedIntent) {
      return;
    }

    setIsSubmitting(true);
    try {
      const mission = createMission({ parcel, persona, intent: trimmedIntent });
      const submitted = await submitMissionToOctopus(mission);
      const nextMissions = [submitted, ...missions];
      setMissions(nextMissions);
      saveMissions(nextMissions);
      recordActivity({
        type: "mission-sent",
        label: "Mission envoyee",
        detail: submitted.intent
      });
      submitted.proposedSeeds.forEach((seed) => {
        recordActivity({
          type: "seed-created",
          label: "Graine creee",
          detail: `${seed.label} (${submitted.parcel})`
        });
      });
      setIntent("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const promoteSeedToWip = (missionId: string, seedId: string) => {
    const nextMissions = missions.map((mission) => {
      if (mission.id !== missionId || !mission.octopusResponse) {
        return mission;
      }

      const proposedSeeds = mission.octopusResponse.proposedSeeds.map((seed) =>
        seed.id === seedId ? { ...seed, status: "wip" as const } : seed
      );

      return {
        ...mission,
        proposedSeeds,
        octopusResponse: {
          ...mission.octopusResponse,
          proposedSeeds
        }
      };
    });

    setMissions(nextMissions);
    saveMissions(nextMissions);
    recordActivity({
      type: "recommendation-applied",
      label: "Graine promue en WIP",
      detail: seedId
    });
  };

  return (
    <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] gap-6">
      <Card className="bg-card border-border shadow-md">
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle className="font-serif">Nouvelle mission client</CardTitle>
          <CardDescription className="font-mono text-xs">
            Publisher AI recueille l'intention et prepare une mission structuree pour Octopus.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 pt-6">
          <div className="space-y-2">
            <Label htmlFor="client-intent" className="font-mono text-xs uppercase text-muted-foreground">
              Quelle intention le client exprime-t-il ?
            </Label>
            <Textarea
              id="client-intent"
              value={intent}
              onChange={(event) => setIntent(event.target.value)}
              placeholder="Prepare une premiere campagne pour Yael Bali"
              className="min-h-28 bg-secondary/50 border-border"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="font-mono text-xs uppercase text-muted-foreground">Parcelle / client</Label>
              <Select value={parcel} onValueChange={(value) => setParcel(value)}>
                <SelectTrigger className="bg-secondary/50 border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {parcels.map((item) => (
                    <SelectItem key={item.id} value={item.name}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="font-mono text-xs uppercase text-muted-foreground">Persona</Label>
              <Select value={persona} onValueChange={(value) => setPersona(value as MissionPersona)}>
                <SelectTrigger className="bg-secondary/50 border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {personas.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !intent.trim() || parcels.length === 0}
            className="font-mono font-bold"
          >
            <SendHorizontal className="w-4 h-4" />
            Envoyer a Octopus
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-card border-border shadow-md">
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle className="font-serif">Missions envoyees a Octopus</CardTitle>
          <CardDescription className="font-mono text-xs">Intentions locales en attente d'orchestration.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {missions.length === 0 ? (
            <div className="p-6 text-center border border-dashed border-border rounded-md bg-secondary/20">
              <p className="text-sm font-mono text-muted-foreground">Aucune mission envoyee pour l'instant.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {missions.map((mission) => {
                const parcelName = getParcelDisplayName(mission.parcel, parcels);
                const archivedParcelLabel = getArchivedParcelLabel(mission.parcel, parcels);

                return (
                  <article key={mission.id} className="p-4 border border-border rounded-md bg-secondary/20 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-serif font-semibold text-foreground">{parcelName}</h3>
                        {archivedParcelLabel ? (
                          <p className="text-[11px] font-mono text-muted-foreground">Ancien libelle : {archivedParcelLabel}</p>
                        ) : null}
                        <p className="text-xs font-mono text-muted-foreground">{mission.persona}</p>
                      </div>
                      <span className="text-[10px] font-mono uppercase border border-border rounded px-2 py-1 text-muted-foreground">
                        {mission.octopusStatus}
                      </span>
                    </div>
                    <p className="text-sm text-foreground">{mission.intent}</p>
                    {mission.octopusResponse ? (
                      <div className="space-y-3 rounded-md border border-border bg-background/40 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[11px] font-mono uppercase text-muted-foreground">Statut Octopus</p>
                          <span className="text-[10px] font-mono uppercase border border-border rounded px-2 py-1 text-muted-foreground">
                            {mission.octopusResponse.octopusStatus}
                          </span>
                        </div>
                        <p className="text-xs font-mono text-primary">Octopus a recu la mission</p>
                        <div className="space-y-2">
                          <p className="text-[11px] font-mono uppercase text-muted-foreground">Graines proposees</p>
                          <div className="space-y-2">
                            {mission.octopusResponse.proposedSeeds.map((seed) => (
                              <div key={seed.id} className="rounded border border-border bg-secondary/30 p-2">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm font-medium text-foreground">{seed.label}</p>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-mono uppercase text-muted-foreground">{seed.type}</span>
                                    <span className="text-[10px] font-mono uppercase border border-border rounded px-2 py-1 text-muted-foreground">
                                      {seed.status === "harvest-draft" ? "Harvest draft" : seed.status === "wip" ? "WIP" : "Seed"}
                                    </span>
                                  </div>
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">{seed.rationale}</p>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => promoteSeedToWip(mission.id, seed.id)}
                                  disabled={seed.status !== "seed"}
                                  className="mt-3 font-mono"
                                >
                                  Promouvoir en WIP
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[11px] font-mono uppercase text-muted-foreground">Prochaines actions</p>
                          {mission.octopusResponse.nextActions.length > 0 ? (
                            <ul className="list-disc pl-4 text-xs text-muted-foreground">
                              {mission.octopusResponse.nextActions.map((action) => (
                                <li key={action}>{action}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-muted-foreground">Aucune action suivante proposee pour l'instant.</p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="text-[11px] font-mono uppercase text-muted-foreground">Notes</p>
                          {mission.octopusResponse.notes.length > 0 ? (
                            <ul className="list-disc pl-4 text-xs text-muted-foreground">
                              {mission.octopusResponse.notes.map((note) => (
                                <li key={note}>{note}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-muted-foreground">Aucune note pour cette mission.</p>
                          )}
                        </div>
                      </div>
                    ) : null}
                    <p className="text-[11px] font-mono text-muted-foreground">
                      {new Date(mission.createdAt).toLocaleString("fr-FR")}
                    </p>
                  </article>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
