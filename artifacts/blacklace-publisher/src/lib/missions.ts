export type MissionParcel = "Yael Bali" | "Blacklace" | "Benoît / Personnel" | "Nouveau client";

export type MissionPersona = "neutre" | "conseiller marketing" | "assistant commercial";

export interface ProposedSeed {
  readonly id: string;
  readonly label: string;
  readonly type: "analyse" | "contenu" | "prospection";
  readonly status: "seed" | "wip" | "harvest-draft";
  readonly rationale: string;
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
  return nextMissions;
}

export function prepareHarvestDraft(parcel: MissionParcel): ClientMission[] {
  const missions = loadMissions();
  let prepared = false;

  const nextMissions = missions.map((mission) => {
    if (mission.parcel !== parcel || !mission.octopusResponse || prepared) {
      return mission;
    }

    const wipSeed = mission.octopusResponse.proposedSeeds.find((seed) => seed.status === "wip");
    if (!wipSeed) {
      return mission;
    }

    prepared = true;
    return updateSeedStatus(mission, wipSeed.id, "harvest-draft");
  });

  saveMissions(nextMissions);
  return nextMissions;
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
