import { describe, it, expect } from "vitest";
import { MissionPlanner } from "../mission-planner/planner";

const planner = new MissionPlanner();

describe("MissionPlanner", () => {
  it("mappe une demande de plan article vers draft_article_outline", () => {
    const mission = planner.plan({ text: "fais un plan article" });
    expect(mission.id).toBe("draft_article_outline");
    expect(mission.workflowId).toBe("draft_article_outline");
  });

  it("mappe une demande d'analyse client vers analyze_client_profile", () => {
    const mission = planner.plan({ text: "analyse ce client" });
    expect(mission.id).toBe("analyze_client_profile");
    expect(mission.workflowId).toBe("analyze_client_profile");
  });

  it("échoue proprement sur une intention inconnue", () => {
    expect(() => planner.plan({ text: "publie sur TikTok maintenant" })).toThrow(
      "Mission inconnue",
    );
  });

  it("retourne une mission versionnée avec capabilities", () => {
    const mission = planner.plan({ text: "outline" });
    expect(mission.version).toBeTruthy();
    expect(mission.requiredCapabilities.length).toBeGreaterThan(0);
  });

  it("accepte workspaceId et context sans erreur", () => {
    expect(() =>
      planner.plan({
        text: "analyse ce client",
        workspaceId: "ws-42",
        context: { source: "crm" },
      }),
    ).not.toThrow();
  });
});
