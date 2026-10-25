import type {
  GardenEvent,
  GardenMission,
  GardenMode,
  GardenSnapshot,
  AgentRole,
  MissionStatus,
} from "./contracts.js";
export const roles: Record<AgentRole, string>;
export const statuses: Record<MissionStatus, string>;
export function safeResultUrl(input: unknown): string | undefined;
export function validateEvent(
  input: unknown,
  mode: GardenMode,
): GardenEvent | null;
export function mergeEvents(
  previous: unknown[],
  incoming: unknown[],
  mode: GardenMode,
): { events: GardenEvent[]; rejectedCount: number };
export function projectMissions(
  events: unknown[],
  mode: GardenMode,
): GardenMission[];
export function parseSnapshot(
  input: unknown,
  mode?: GardenMode,
): GardenSnapshot;
export function roleForCapabilities(input: unknown): AgentRole;
export function visualState(mission: { status: MissionStatus }): {
  route: boolean;
  moving: boolean;
  blocked: boolean;
  delivered: boolean;
};
export function adaptGerard(
  input: unknown,
  projects: GardenSnapshot["projects"],
): { events: GardenEvent[]; rejectedCount: number };
export function adaptOctopus(
  input: unknown,
  projects: GardenSnapshot["projects"],
): { events: GardenEvent[]; rejectedCount: number };
