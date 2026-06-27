import type { UserIntent, MissionDefinition } from "octopus-engine";
import { MISSION_CATALOG, listMissionIds } from "./catalog";
import { capabilityResolver } from "./capability-resolver";

/**
 * Règles de correspondance déterministes.
 * L'ordre compte : première règle gagnante.
 * Aucun LLM. Aucune probabilité. Aucune logique floue.
 */
const MATCH_RULES: Array<{
  test: (text: string) => boolean;
  missionId: string;
}> = [
  {
    test: (t) => t.includes("plan article") || t.includes("outline"),
    missionId: "draft_article_outline",
  },
  {
    test: (t) =>
      t.includes("client") ||
      t.includes("profil") ||
      t.includes("analyse") ||
      t.includes("analyze"),
    missionId: "analyze_client_profile",
  },
];

function matchMission(text: string): MissionDefinition | null {
  const normalized = text.toLowerCase().trim();
  for (const rule of MATCH_RULES) {
    if (rule.test(normalized)) {
      return MISSION_CATALOG.find((m) => m.id === rule.missionId) ?? null;
    }
  }
  return null;
}

/**
 * MissionPlanner — traduit un UserIntent en MissionDefinition.
 *
 * Invariants :
 * - Déterministe : même entrée → même sortie.
 * - N'invente jamais une mission absente du MissionCatalog.
 * - Délègue la validation des prérequis au CapabilityResolver → Guardian.
 * - Lève une erreur lisible par un humain en cas d'échec.
 */
export class MissionPlanner {
  plan(intent: UserIntent): MissionDefinition {
    const mission = matchMission(intent.text);

    if (!mission) {
      throw new Error(
        `Mission inconnue — aucune mission ne correspond à votre demande. ` +
          `Missions disponibles : ${listMissionIds().join(", ")}.`,
      );
    }

    capabilityResolver.validate(mission.requiredCapabilities);

    return mission;
  }
}
