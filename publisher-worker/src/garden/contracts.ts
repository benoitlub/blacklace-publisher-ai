/** Le Jardin des Gégé, contract v1. Roles describe work, never agent instances. */
export type MissionStatus =
  "queued" | "running" | "completed" | "failed" | "blocked" | "retrying";
export type AgentRole =
  | "cueilleur"
  | "tresseur"
  | "enlumineur"
  | "passeur"
  | "greffeur"
  | "jardinier"
  | "semeur";
export type GardenMode = "demo" | "real";
export interface GardenEvent {
  id: string;
  missionId: string;
  projectId: string;
  agentRole: AgentRole;
  title: string;
  type: string;
  status: MissionStatus;
  timestamp: string;
  sourceSystem: string;
  sourceEventId: string;
  provenance: GardenMode;
  sequence?: number;
  resultUrl?: string;
  resultKind?: "internal-cycle" | "harvest" | "publication";
  errorMessage?: string;
  // No arbitrary source payload, prompts, credentials, personal data or raw errors.
}
export interface GardenMission {
  id: string;
  projectId: string;
  agentRole: AgentRole;
  title: string;
  status: MissionStatus;
  currentStep: string;
  startedAt?: string;
  completedAt?: string;
  lastEventAt: string;
  sourceSystem: string;
  sourceEventId: string;
  provenance: GardenMode;
  resultUrl?: string;
  resultKind?: GardenEvent["resultKind"];
  errorMessage?: string;
  history: GardenEvent[];
}
export interface GardenSnapshot {
  schemaVersion: 1;
  mode: GardenMode;
  transport: "snapshot"; // This prototype does not claim to be a live stream.
  generatedAt: string;
  sourceRef: string;
  coverage: "partial";
  projects: { id: string; label: string }[];
  events: GardenEvent[];
  rejectedCount: number;
  sources?: GardenSourceState[];
}
export interface GardenSourceState {
  id: string;
  state: "available" | "unavailable";
  observedAt: string;
  lastEventAt?: string;
}
export type ConnectionState =
  "loading" | "snapshot" | "connected" | "partial" | "offline" | "invalid";
