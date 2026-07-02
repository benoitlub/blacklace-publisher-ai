import { describe, it, expect, beforeEach } from "vitest";
import { createMission, submitMissionToOctopus, saveMissions, loadHarvestDrafts, promoteFirstSeedToWip, prepareHarvestDraft } from "@/lib/missions";
import { runGardenWorker } from "@/lib/gardenWorker";

describe("Intent → Seed → Garden → Recommendation → HarvestDraft loop", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("produces seed recommendations after a mission is submitted, then promotes a seed to WIP", async () => {
    const mission = createMission({ parcel: "Yael Bali", persona: "neutre", intent: "Prépare une campagne pour Yael Bali" });
    const submitted = await submitMissionToOctopus(mission);
    saveMissions([submitted]);

    expect(submitted.octopusResponse?.proposedSeeds.length).toBeGreaterThan(0);
    expect(submitted.octopusResponse?.proposedSeeds.every((seed) => seed.status === "seed")).toBe(true);

    const report = runGardenWorker();
    const parcelReport = report.parcels.find((p) => p.parcel === "Yael Bali");

    expect(parcelReport).toBeDefined();
    expect(parcelReport?.seedsCount).toBeGreaterThan(0);
    expect(parcelReport?.recommendations).toContain("Promouvoir une graine en WIP.");

    const afterPromotion = promoteFirstSeedToWip("Yael Bali");
    const promotedMission = afterPromotion.find((m) => m.id === mission.id);
    expect(promotedMission?.octopusResponse?.proposedSeeds.some((seed) => seed.status === "wip")).toBe(true);
  });

  it("prepares and persists a HarvestDraft when the recommendation is applied to a WIP seed", async () => {
    const mission = createMission({ parcel: "Yael Bali", persona: "neutre", intent: "Prépare une campagne pour Yael Bali" });
    const submitted = await submitMissionToOctopus(mission);
    saveMissions([submitted]);

    promoteFirstSeedToWip("Yael Bali");

    const reportAfterPromotion = runGardenWorker();
    const parcelReportAfterPromotion = reportAfterPromotion.parcels.find((p) => p.parcel === "Yael Bali");
    expect(parcelReportAfterPromotion?.recommendations).toContain("Preparer une recolte.");

    const draft = prepareHarvestDraft("Yael Bali");

    expect(draft).not.toBeNull();
    expect(draft?.parcel).toBe("Yael Bali");
    expect(draft?.missionId).toBe(mission.id);

    const persistedDrafts = loadHarvestDrafts();
    expect(persistedDrafts).toHaveLength(1);
    expect(persistedDrafts[0].id).toBe(draft?.id);

    const finalReport = runGardenWorker();
    const finalParcelReport = finalReport.parcels.find((p) => p.parcel === "Yael Bali");
    expect(finalParcelReport?.harvestReadyCount).toBe(1);
  });

  it("returns null and does not create a HarvestDraft when no seed is in WIP status", () => {
    const draft = prepareHarvestDraft("Yael Bali");
    expect(draft).toBeNull();
    expect(loadHarvestDrafts()).toHaveLength(0);
  });
});
