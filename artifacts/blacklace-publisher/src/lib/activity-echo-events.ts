import type { ActivityEvent, ActivityStatus, Pole } from "@/components/activity-echo";
import type { ActivityEntry } from "@/lib/missions";

type Mapping = { readonly pole: Pole; readonly status: ActivityStatus; readonly label: string };

const DEFAULT_MAPPING: Mapping = { pole: "publisher", status: "observation", label: "Activité Publisher" };
const PUBLISHER_ACTIVITY_MAPPING: Record<string, Mapping> = {
  "mission-sent": { pole: "octopus", status: "experimentation", label: "Mission envoyée" },
  "seed-created": { pole: "garden", status: "recolte", label: "Graine créée" },
  "recommendation-applied": { pole: "garden", status: "preparation", label: "Recommandation appliquée" },
  "harvest-draft-created": { pole: "garden", status: "recolte", label: "HarvestDraft préparé" },
  "publication-draft-generated": { pole: "publisher", status: "reussite", label: "PublicationDraft généré" },
  "publication-draft-updated": { pole: "publisher", status: "preparation", label: "PublicationDraft mis à jour" },
  "radar-launched": { pole: "radar", status: "observation", label: "Radar lancé" },
  "candidate-detected": { pole: "radar", status: "observation", label: "Candidat détecté" },
  "observation-memorized": { pole: "observatoire", status: "reflexion", label: "Observation mémorisée" },
  "knowledge-pack-created": { pole: "observatoire", status: "reussite", label: "Knowledge Pack créé" },
  "tool-compared": { pole: "publisher", status: "reflexion", label: "Outil comparé" },
  "provider-call-started": { pole: "octopus", status: "experimentation", label: "Appel provider lancé" },
  "fallback-used": { pole: "octopus", status: "blocage", label: "Fallback utilisé" },
  "test-in-progress": { pole: "publisher", status: "experimentation", label: "Test en cours" },
  "blockage-detected": { pole: "octopus", status: "blocage", label: "Blocage détecté" },
};

export function toActivityEchoEvents(entries: readonly ActivityEntry[]): ActivityEvent[] {
  return entries.slice().reverse().map((entry) => {
    const mapping = PUBLISHER_ACTIVITY_MAPPING[String(entry.type)] ?? DEFAULT_MAPPING;
    return {
      id: entry.id,
      pole: mapping.pole,
      label: entry.detail ? `${mapping.label} · ${entry.detail}` : mapping.label,
      status: mapping.status,
      at: new Date(entry.createdAt).getTime(),
    };
  });
}
