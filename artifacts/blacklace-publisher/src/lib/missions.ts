export type MissionParcel = string;

export type MissionPersona = string;

export interface ProposedSeed {
  readonly id: string;
  readonly label: string;
  readonly type: "analyse" | "contenu" | "prospection";
  readonly status: "seed" | "wip" | "harvest-draft";
  readonly rationale: string;
}

export interface HarvestDraft {
  readonly id: string;
  readonly missionId: string;
  readonly seedId: string;
  readonly parcel: MissionParcel;
  readonly title: string;
  readonly summary: string;
  readonly createdAt: string;
  readonly status: "draft";
}

export interface PublicationDiagnostic {
  readonly provider: "mock" | "mistral" | "error" | string;
  readonly knowledgeSource: "mock" | "notion" | "error" | string;
  readonly model?: string;
  readonly fallbackReason?: string | null;
}

export interface PublicationDraft {
  readonly id: string;
  readonly harvestDraftId: string;
  readonly missionId: string;
  readonly seedId: string;
  readonly parcel: MissionParcel;
  readonly title: string;
  readonly channel: string;
  readonly text: string;
  readonly source: "mock" | "real" | "error";
  readonly diagnostic: PublicationDiagnostic;
  readonly status: "draft" | "validated" | "ready-to-publish";
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ActivityEntry {
  readonly id: string;
  readonly createdAt: string;
  readonly type:
    | "mission-sent"
    | "seed-created"
    | "recommendation-applied"
    | "harvest-draft-created"
    | "publication-draft-generated"
    | "publication-draft-updated";
  readonly label: string;
  readonly detail?: string;
}

export interface OctopusMissionResponse {
  readonly missionId: string;
  readonly octopusStatus: "received";
  readonly receivedAt: string;
  readonly parcel: MissionParcel;
  readonly intent: string;
  readonly proposedSeeds: readonly ProposedSeed[];
  readonly nextActions: readonly string[];
  readonly notes: readonly string[];
}

export interface ClientMission {
  readonly id: string;
  readonly createdAt: string;
  readonly interface: "publisher-ai";
  readonly persona: MissionPersona;
  readonly parcel: MissionParcel;
  readonly intent: string;
  readonly status: "received";
  readonly octopusStatus: "pending" | "received";
  readonly proposedSeeds: readonly ProposedSeed[];
  readonly notes: readonly string[];
  readonly octopusResponse?: OctopusMissionResponse;
}

export interface CreateMissionInput {
  readonly parcel: MissionParcel;
  readonly persona: MissionPersona;
  readonly intent: string;
}

const MISSIONS_STORAGE_KEY = "publisher-ai:missions";
const HARVEST_DRAFTS_STORAGE_KEY = "publisher-ai:harvest-drafts";
const PUBLICATION_DRAFTS_STORAGE_KEY = "publisher-ai:publication-drafts";
const ACTIVITY_STORAGE_KEY = "publisher-ai:activity";
const MAX_ACTIVITY_ITEMS = 50;

export const PUBLISHER_LOOP_CHANGED_EVENT = "publisher-ai:loop-changed";

export function createMission(input: CreateMissionInput): ClientMission {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    interface: "publisher-ai",
    persona: input.persona,
    parcel: input.parcel,
    intent: input.intent.trim(),
    status: "received",
    octopusStatus: "pending",
    proposedSeeds: [],
    notes: []
  };
}

export async function submitMissionToOctopus(mission: ClientMission): Promise<ClientMission> {
  const response: OctopusMissionResponse = {
    missionId: mission.id,
    octopusStatus: "received",
    receivedAt: new Date().toISOString(),
    parcel: mission.parcel,
    intent: mission.intent,
    proposedSeeds: createProposedSeeds(mission),
    nextActions: [],
    notes: []
  };

  return {
    ...mission,
    octopusStatus: response.octopusStatus,
    proposedSeeds: response.proposedSeeds,
    notes: response.notes,
    octopusResponse: response
  };
}

export function loadMissions(): ClientMission[] {
  const raw = window.localStorage.getItem(MISSIONS_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isClientMission) : [];
  } catch {
    return [];
  }
}

export function saveMissions(missions: readonly ClientMission[]): void {
  window.localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions));
  notifyPublisherLoopChanged();
}

export function loadHarvestDrafts(): HarvestDraft[] {
  const raw = window.localStorage.getItem(HARVEST_DRAFTS_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isHarvestDraft) : [];
  } catch {
    return [];
  }
}

export function saveHarvestDrafts(drafts: readonly HarvestDraft[]): void {
  window.localStorage.setItem(HARVEST_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
  notifyPublisherLoopChanged();
}

export function loadPublicationDrafts(): PublicationDraft[] {
  const raw = window.localStorage.getItem(PUBLICATION_DRAFTS_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isPublicationDraft) : [];
  } catch {
    return [];
  }
}

export function savePublicationDrafts(drafts: readonly PublicationDraft[]): void {
  window.localStorage.setItem(PUBLICATION_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
  notifyPublisherLoopChanged();
}

export function mergePublicationDrafts(drafts: readonly PublicationDraft[]): PublicationDraft[] {
  const existing = loadPublicationDrafts();
  const existingKeys = new Set(existing.map((draft) => `${draft.harvestDraftId}:${draft.channel}:${draft.title}`));
  const uniqueIncoming = drafts.filter((draft) => !existingKeys.has(`${draft.harvestDraftId}:${draft.channel}:${draft.title}`));
  const merged = [...uniqueIncoming, ...existing];
  savePublicationDrafts(merged);
  return merged;
}

export function updatePublicationDraft(
  draftId: string,
  updates: Partial<Pick<PublicationDraft, "title" | "channel" | "text" | "status">>
): PublicationDraft[] {
  const nextDrafts = loadPublicationDrafts().map((draft) =>
    draft.id === draftId ? { ...draft, ...updates, updatedAt: new Date().toISOString() } : draft
  );
  savePublicationDrafts(nextDrafts);
  recordActivity({
    type: "publication-draft-updated",
    label: "PublicationDraft mis a jour",
    detail: updates.status ? `Statut : ${updates.status}` : undefined
  });
  return nextDrafts;
}

export function loadActivityEntries(): ActivityEntry[] {
  const raw = window.localStorage.getItem(ACTIVITY_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isActivityEntry) : [];
  } catch {
    return [];
  }
}

export function recordActivity(input: Omit<ActivityEntry, "id" | "createdAt">): ActivityEntry[] {
  const entry: ActivityEntry = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...input
  };
  const nextEntries = [entry, ...loadActivityEntries()].slice(0, MAX_ACTIVITY_ITEMS);
  window.localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(nextEntries));
  notifyPublisherLoopChanged();
  return nextEntries;
}

export function promoteFirstSeedToWip(parcel: MissionParcel): ClientMission[] {
  const missions = loadMissions();
  let promoted = false;

  const nextMissions = missions.map((mission) => {
    if (mission.parcel !== parcel || !mission.octopusResponse || promoted) {
      return mission;
    }

    const seedToPromote = mission.octopusResponse.proposedSeeds.find((seed) => seed.status === "seed");
    if (!seedToPromote) {
      return mission;
    }

    promoted = true;
    return updateSeedStatus(mission, seedToPromote.id, "wip");
  });

  saveMissions(nextMissions);
  if (promoted) {
    recordActivity({
      type: "recommendation-applied",
      label: "Recommandation appliquee",
      detail: `Une graine de ${parcel} est passee en WIP.`
    });
  }
  return nextMissions;
}

export function prepareHarvestDraft(parcel: MissionParcel): HarvestDraft | null {
  const missions = loadMissions();
  let preparedDraft: HarvestDraft | null = null;

  const nextMissions = missions.map((mission) => {
    if (mission.parcel !== parcel || !mission.octopusResponse || preparedDraft) {
      return mission;
    }

    const wipSeed = mission.octopusResponse.proposedSeeds.find((seed) => seed.status === "wip");
    if (!wipSeed) {
      return mission;
    }

    preparedDraft = createHarvestDraft(mission, wipSeed);
    return updateSeedStatus(mission, wipSeed.id, "harvest-draft");
  });

  saveMissions(nextMissions);

  if (preparedDraft) {
    saveHarvestDrafts([preparedDraft, ...loadHarvestDrafts()]);
    recordActivity({
      type: "harvest-draft-created",
      label: "HarvestDraft cree",
      detail: preparedDraft.title
    });
  }

  return preparedDraft;
}

export async function createPublicationDraftFromHarvest(
  harvestDraft: HarvestDraft,
  channel = "Instagram"
): Promise<PublicationDraft> {
  const prompt = `Prepare une publication pour ${harvestDraft.parcel} a partir de cette recolte : ${harvestDraft.summary}`;

  try {
    const response = await fetch("/api/generate/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        universe: harvestDraft.parcel,
        agentId: 1,
        platform: channel,
        prompt
      })
    });

    const payload = (await response.json()) as Partial<GeneratePostResponse>;
    if (!response.ok) {
      throw new Error(typeof payload.error === "string" ? payload.error : "Generation indisponible");
    }

    const draft = createPublicationDraft({
      harvestDraft,
      channel: payload.platform ?? channel,
      title: payload.title ?? harvestDraft.title,
      text: payload.content ?? "",
      source: payload.isMock ? "mock" : "real",
      diagnostic: {
        provider: payload.aiProvider ?? (payload.isMock ? "mock" : "mistral"),
        knowledgeSource: payload.knowledgeSource ?? "mock",
        model: payload.model,
        fallbackReason: payload.fallbackReason ?? null
      }
    });

    savePublicationDrafts([draft, ...loadPublicationDrafts()]);
    recordActivity({
      type: "publication-draft-generated",
      label: "PublicationDraft genere",
      detail: draft.title
    });
    return draft;
  } catch (error) {
    const fallbackReason = error instanceof Error ? error.message : "Generation indisponible";
    const draft = createPublicationDraft({
      harvestDraft,
      channel,
      title: harvestDraft.title,
      text: "Generation indisponible pour l'instant. Le HarvestDraft reste pret a etre regenere.",
      source: "error",
      diagnostic: {
        provider: "error",
        knowledgeSource: "error",
        fallbackReason
      }
    });

    savePublicationDrafts([draft, ...loadPublicationDrafts()]);
    recordActivity({
      type: "publication-draft-generated",
      label: "PublicationDraft genere avec diagnostic d'erreur",
      detail: fallbackReason
    });
    return draft;
  }
}

interface GeneratePostResponse {
  readonly title: string;
  readonly content: string;
  readonly platform: string;
  readonly aiProvider: string;
  readonly knowledgeSource: "mock" | "notion";
  readonly model?: string;
  readonly isMock: boolean;
  readonly fallbackReason: string | null;
  readonly error?: string;
}

function createPublicationDraft(input: {
  readonly harvestDraft: HarvestDraft;
  readonly channel: string;
  readonly title: string;
  readonly text: string;
  readonly source: PublicationDraft["source"];
  readonly diagnostic: PublicationDiagnostic;
}): PublicationDraft {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    harvestDraftId: input.harvestDraft.id,
    missionId: input.harvestDraft.missionId,
    seedId: input.harvestDraft.seedId,
    parcel: input.harvestDraft.parcel,
    title: input.title,
    channel: input.channel,
    text: input.text,
    source: input.source,
    diagnostic: input.diagnostic,
    status: "draft",
    createdAt: now,
    updatedAt: now
  };
}

function createHarvestDraft(mission: ClientMission, seed: ProposedSeed): HarvestDraft {
  return {
    id: crypto.randomUUID(),
    missionId: mission.id,
    seedId: seed.id,
    parcel: mission.parcel,
    title: seed.label,
    summary: `Brouillon de recolte prepare depuis la mission : ${mission.intent}`,
    createdAt: new Date().toISOString(),
    status: "draft"
  };
}

function isClientMission(value: unknown): value is ClientMission {
  const mission = value as Partial<ClientMission>;
  return (
    typeof mission.id === "string" &&
    typeof mission.createdAt === "string" &&
    mission.interface === "publisher-ai" &&
    typeof mission.persona === "string" &&
    typeof mission.parcel === "string" &&
    typeof mission.intent === "string" &&
    mission.status === "received" &&
    (mission.octopusStatus === "pending" || mission.octopusStatus === "received") &&
    Array.isArray(mission.proposedSeeds) &&
    Array.isArray(mission.notes)
  );
}

function isHarvestDraft(value: unknown): value is HarvestDraft {
  const draft = value as Partial<HarvestDraft>;
  return (
    typeof draft.id === "string" &&
    typeof draft.missionId === "string" &&
    typeof draft.seedId === "string" &&
    typeof draft.parcel === "string" &&
    typeof draft.title === "string" &&
    typeof draft.summary === "string" &&
    typeof draft.createdAt === "string" &&
    draft.status === "draft"
  );
}

function isPublicationDraft(value: unknown): value is PublicationDraft {
  const draft = value as Partial<PublicationDraft>;
  return (
    typeof draft.id === "string" &&
    typeof draft.harvestDraftId === "string" &&
    typeof draft.missionId === "string" &&
    typeof draft.seedId === "string" &&
    typeof draft.parcel === "string" &&
    typeof draft.title === "string" &&
    typeof draft.channel === "string" &&
    typeof draft.text === "string" &&
    (draft.source === "mock" || draft.source === "real" || draft.source === "error") &&
    typeof draft.diagnostic === "object" &&
    draft.diagnostic !== null &&
    (draft.status === "draft" || draft.status === "validated" || draft.status === "ready-to-publish") &&
    typeof draft.createdAt === "string" &&
    typeof draft.updatedAt === "string"
  );
}

function isActivityEntry(value: unknown): value is ActivityEntry {
  const entry = value as Partial<ActivityEntry>;
  return typeof entry.id === "string" && typeof entry.createdAt === "string" && typeof entry.label === "string";
}

function notifyPublisherLoopChanged(): void {
  window.dispatchEvent(new CustomEvent(PUBLISHER_LOOP_CHANGED_EVENT));
}

function updateSeedStatus(
  mission: ClientMission,
  seedId: string,
  status: ProposedSeed["status"]
): ClientMission {
  if (!mission.octopusResponse) {
    return mission;
  }

  const proposedSeeds = mission.octopusResponse.proposedSeeds.map((seed) =>
    seed.id === seedId ? { ...seed, status } : seed
  );

  return {
    ...mission,
    proposedSeeds,
    octopusResponse: {
      ...mission.octopusResponse,
      proposedSeeds
    }
  };
}

function createProposedSeeds(mission: ClientMission): ProposedSeed[] {
  if (mission.parcel === "Yael Bali") {
    return [
      {
        id: `${mission.id}:seed:analyse`,
        label: "audit présence actuelle",
        type: "analyse",
        status: "seed",
        rationale: "Comprendre les supports et messages existants avant de proposer une campagne."
      },
      {
        id: `${mission.id}:seed:contenu`,
        label: "première campagne Facebook",
        type: "contenu",
        status: "seed",
        rationale: "Transformer l'intention en première prise de parole visible et actionnable."
      },
      {
        id: `${mission.id}:seed:prospection`,
        label: "liste de prospects locaux",
        type: "prospection",
        status: "seed",
        rationale: "Préparer une base de contacts locale pour soutenir la campagne."
      }
    ];
  }

  return [
    {
      id: `${mission.id}:seed:analyse`,
      label: `Analyse de l'intention ${mission.parcel}`,
      type: "analyse",
      status: "seed",
      rationale: "Clarifier le contexte, les contraintes et les objectifs avant production."
    },
    {
      id: `${mission.id}:seed:contenu`,
      label: `Première piste de contenu ${mission.parcel}`,
      type: "contenu",
      status: "seed",
      rationale: "Transformer l'intention en angle éditorial testable."
    },
    {
      id: `${mission.id}:seed:prospection`,
      label: `Piste de prospection ${mission.parcel}`,
      type: "prospection",
      status: "seed",
      rationale: "Identifier les premières cibles ou relais utiles pour activer la mission."
    }
  ];
}
