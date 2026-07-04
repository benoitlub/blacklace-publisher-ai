import { beforeEach, describe, expect, it, vi } from "vitest";
import { runGardenWorker } from "@/lib/gardenWorker";
import {
  createMission,
  createPublicationDraftFromHarvest,
  loadHarvestDrafts,
  loadPublicationDrafts,
  prepareHarvestDraft,
  promoteFirstSeedToWip,
  saveMissions,
  submitMissionToOctopus,
  updatePublicationDraft
} from "@/lib/missions";

describe("Intent -> Seed -> Garden -> Recommendation -> HarvestDraft -> PublicationDraft loop", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("produces seed recommendations after a mission is submitted, then promotes a seed to WIP", async () => {
    const mission = createMission({ parcel: "Yael Bali", persona: "neutre", intent: "Prepare une campagne pour Yael Bali" });
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
    const mission = createMission({ parcel: "Yael Bali", persona: "neutre", intent: "Prepare une campagne pour Yael Bali" });
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

  it("generates, persists, edits and marks a PublicationDraft from a HarvestDraft", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            title: "Premiere campagne Facebook",
            content: "Texte prepare pour Yael Bali.",
            platform: "Instagram",
            aiProvider: "mock",
            knowledgeSource: "mock",
            isMock: true,
            fallbackReason: "Mode mock actif"
          }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const mission = createMission({ parcel: "Yael Bali", persona: "neutre", intent: "Prepare une campagne pour Yael Bali" });
    const submitted = await submitMissionToOctopus(mission);
    saveMissions([submitted]);
    promoteFirstSeedToWip("Yael Bali");
    const harvestDraft = prepareHarvestDraft("Yael Bali");

    expect(harvestDraft).not.toBeNull();

    const publicationDraft = await createPublicationDraftFromHarvest(harvestDraft!, "Instagram");
    expect(publicationDraft.title).toBe("Premiere campagne Facebook");
    expect(publicationDraft.source).toBe("mock");
    expect(publicationDraft.diagnostic.provider).toBe("mock");
    expect(loadPublicationDrafts()).toHaveLength(1);

    const updatedDrafts = updatePublicationDraft(publicationDraft.id, {
      text: "Texte modifie.",
      status: "ready-to-publish"
    });

    expect(updatedDrafts[0].text).toBe("Texte modifie.");
    expect(updatedDrafts[0].status).toBe("ready-to-publish");
  });
});
