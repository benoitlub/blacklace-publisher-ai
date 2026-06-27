import { Router } from "express";
import { Coordinator, defineModule } from "octopus-engine";
import type { UserIntent } from "octopus-engine";
import { MissionPlanner } from "../octopus/mission-planner/planner";
import { draftArticleOutlineWorkflow } from "../octopus/workflows/draft_article_outline";
import { analyzeClientProfileWorkflow } from "../octopus/workflows/analyze_client_profile";

const router = Router();

const WORKFLOWS = {
  draft_article_outline: draftArticleOutlineWorkflow,
  analyze_client_profile: analyzeClientProfileWorkflow,
} as const;

// Modules métier Publisher : purs, déterministes, sans LLM, sans réseau.
const MODULES = [
  defineModule({
    id: "extract_topic",
    name: "Extract Topic",
    requiredCapabilities: ["text_generation"],
    execute: async (input) => ({
      topic: typeof input["text"] === "string" ? input["text"] : "Sujet non spécifié",
    }),
  }),

  defineModule({
    id: "build_outline",
    name: "Build Outline",
    requiredCapabilities: ["outline_builder"],
    execute: async (input) => ({
      outline: {
        title: `Plan : ${String(input["topic"] ?? "Article")}`,
        sections: ["Introduction", "Développement", "Exemples concrets", "Conclusion"],
        version: "1.0",
      },
    }),
  }),

  defineModule({
    id: "extract_client_data",
    name: "Extract Client Data",
    requiredCapabilities: ["text_analysis"],
    execute: async (input) => ({
      clientData: {
        raw: typeof input["text"] === "string" ? input["text"] : "",
        extractedAt: new Date().toISOString(),
      },
    }),
  }),

  defineModule({
    id: "synthesize_profile",
    name: "Synthesize Profile",
    requiredCapabilities: ["profile_synthesizer"],
    execute: async (input) => {
      const raw = typeof input["text"] === "string" ? input["text"].slice(0, 80) : "";
      return {
        profile: {
          summary: `Profil analysé à partir de : "${raw}"`,
          segments: ["client", "prospect"],
          confidence: 0.85,
        },
      };
    },
  }),
];

const planner = new MissionPlanner();
const coordinator = new Coordinator(MODULES);

router.post("/mission", async (req, res) => {
  const { text, workspaceId, userId, context } = req.body as Partial<UserIntent>;

  if (!text || typeof text !== "string" || text.trim() === "") {
    return res.status(400).json({ error: "Le champ `text` est requis et ne peut pas être vide." });
  }

  const intent: UserIntent = {
    text: text.trim(),
    workspaceId: workspaceId ?? "default",
    userId,
    context: context ?? {},
  };

  try {
    const mission = planner.plan(intent);
    const workflow = WORKFLOWS[mission.workflowId as keyof typeof WORKFLOWS];

    if (!workflow) {
      return res.status(500).json({ error: `Workflow introuvable : ${mission.workflowId}` });
    }

    const coordinatorResult = await coordinator.run(workflow, {
      text: intent.text,
      workspaceId: intent.workspaceId,
      ...intent.context,
    });

    return res.status(200).json({
      missionId: mission.id,
      workflowId: mission.workflowId,
      result: coordinatorResult.output,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur interne inconnue";
    const isClientError =
      message.startsWith("Mission inconnue") || message.startsWith("Capability missing");

    // Ne jamais logger l'intention complète : elle peut contenir des données client.
    req.log.warn({ errorCode: message.split(":")[0], isClientError }, "octopus:mission:error");

    return res.status(isClientError ? 400 : 500).json({ error: message });
  }
});

export default router;
