import type { GardenSnapshot, GardenEvent } from "./contracts.js";
export function configuredProjects(input: unknown): GardenSnapshot["projects"];
export function adaptHarvests(
  input: unknown,
  projects: GardenSnapshot["projects"],
): { events: GardenEvent[]; rejectedCount: number };
export function buildFeed(input: {
  seeds: unknown;
  state?: unknown;
  harvests?: unknown;
  octopus?: unknown;
  sourceRef: string;
  observedAt: string;
}): GardenSnapshot;
