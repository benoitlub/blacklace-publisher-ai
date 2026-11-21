import { Hono } from "hono";
import { decodeJobId, encodeJobId } from "./job-id";
import { buildProceduralGlb, planProceduralAsset, PROCEDURAL_CAPABILITY, recipePattern } from "./procedural";

type Bindings = {
  OCTOPUS_ENGINE?: { fetch(request: Request): Promise<Response> };
  OCTOPUS_ENGINE_URL?: string;
  PUBLISHER_PUBLIC_URL?: string;
};

export const metaverse = new Hono<{ Bindings: Bindings }>();
const prefix = "/api/metaverse";
const adapterId = "metaverse-procedural";
const provider = "procedural";

const links = (id: string) => ({
  status: `${prefix}/jobs/${id}`,
  model: `${prefix}/jobs/${id}/model.glb`,
});

function recipeFromJob(id: string) {
  try {
    const job = decodeJobId(id);
    return job.provider === provider && recipePattern.test(job.providerJobId) ? job.providerJobId : null;
  } catch {
    return null;
  }
}

metaverse.get("/health", (c) => c.json({
  status: "ok",
  service: "blacklace-metaverse",
  providers: {
    context: { name: "none", endpointConfigured: false },
    generation: {
      mode: "live",
      capability: PROCEDURAL_CAPABILITY,
      endpointConfigured: Boolean(c.env.OCTOPUS_ENGINE || c.env.OCTOPUS_ENGINE_URL),
    },
    asset: { name: provider, credentialConfigured: false },
  },
}));

metaverse.post("/generate", async (c) => {
  const body = await c.req.json<{ intent?: unknown }>().catch(() => null);
  const intent = typeof body?.intent === "string" ? body.intent.trim() : "";
  if (!intent || intent.length > 4_000) return c.json({ error: "Provide an intent of 1 to 4000 characters." }, 400);

  let recipe: string;
  try {
    recipe = planProceduralAsset(intent);
  } catch {
    return c.json({ error: "Describe one supported asset: a crate or a robot." }, 400);
  }

  const engine = c.env.OCTOPUS_ENGINE_URL;
  const publisher = c.env.PUBLISHER_PUBLIC_URL;
  if (!engine || !publisher) return c.json({ error: "Octopus is not configured." }, 503);

  const post = (path: string, payload: unknown) => {
    const request = new Request(new URL(path, engine), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12_000),
    });
    return c.env.OCTOPUS_ENGINE ? c.env.OCTOPUS_ENGINE.fetch(request) : fetch(request);
  };

  try {
    const registration = await post("/adapters/register", {
      id: adapterId,
      name: "Blacklace procedural 3D",
      capabilities: [PROCEDURAL_CAPABILITY],
      executeUrl: new URL(`${prefix}/execute`, publisher).href,
    });
    if (!registration.ok) return c.json({ error: "Octopus could not register the 3D adapter." }, 503);

    const operationId = crypto.randomUUID();
    const response = await post("/mission", {
      operationId,
      title: "Plan a procedural 3D asset",
      objective: "Select a supported procedural recipe.",
      requiredCapabilities: [PROCEDURAL_CAPABILITY],
      authorizedResources: [],
      prompt: recipe.replace(/^v1-/, "").replace("-", " "),
      context: { id: operationId, label: "metaverse-creator" },
    });
    const mission = await response.json<{ status?: string; adapterId?: string; output?: { text?: string } }>();
    if (!response.ok || mission.status !== "completed" || mission.adapterId !== adapterId || mission.output?.text !== recipe) {
      if (mission.status === "waiting-executor") return c.json({ error: "Octopus has no available 3D executor." }, 503);
      return c.json({ error: "Octopus could not complete the 3D mission." }, 502);
    }

    const id = encodeJobId(provider, recipe);
    return c.json({
      status: "accepted", intent, prompt: recipe, provider,
      job: { id, state: "succeeded", progress: 100 },
      links: links(id),
      trace: { generatedAt: new Date().toISOString(), loreSource: "none", backendStatus: mission.status, operationId },
    }, 202);
  } catch {
    return c.json({ error: "Octopus is unavailable." }, 502);
  }
});

metaverse.post("/execute", async (c) => {
  const envelope = await c.req.json<{
    contract?: string;
    adapterId?: string;
    mission?: { prompt?: string; requiredCapabilities?: string[] };
  }>().catch(() => null);
  const mission = envelope?.mission;
  if (envelope?.contract !== "octopus-adapter-execution-v1" || envelope.adapterId !== adapterId ||
      typeof mission?.prompt !== "string" || !/^(crate|robot) (blue|red|green|gold)$/.test(mission.prompt) ||
      !Array.isArray(mission.requiredCapabilities) || !mission.requiredCapabilities.includes(PROCEDURAL_CAPABILITY)) {
    return c.json({ status: "failed", summary: "Invalid procedural mission." }, 400);
  }
  return c.json({ status: "completed", output: { text: planProceduralAsset(mission.prompt) } });
});

metaverse.get("/jobs/:id", (c) => {
  const id = c.req.param("id");
  if (!recipeFromJob(id)) return c.json({ error: "Unknown procedural job." }, 404);
  return c.json({ id, provider, state: "succeeded", progress: 100, ready: true, links: links(id) });
});

metaverse.get("/jobs/:id/model.glb", (c) => {
  const recipe = recipeFromJob(c.req.param("id"));
  if (!recipe) return c.json({ error: "Unknown procedural job." }, 404);
  return new Response(buildProceduralGlb(recipe), { headers: { "Content-Type": "model/gltf-binary" } });
});
