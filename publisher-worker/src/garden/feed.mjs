/** Public metadata projection. No source text, prompt, lead or provider credential is exported. */
import {
  adaptGerard,
  adaptOctopus,
  mergeEvents,
  parseSnapshot,
  roleForCapabilities,
} from "./core.mjs";
const labels = Object.freeze({
  "poulpe-fiction": "Poulpe Fiction",
  "project-yael-prospection": "Yaébali",
  "benoit-business-growth": "Parcelle professionnelle",
});
export function configuredProjects(input) {
  if (!Array.isArray(input?.seeds))
    throw new Error("Configured projects missing");
  return [...new Set(input.seeds.map((x) => x?.parcelId))]
    .filter((id) => Object.hasOwn(labels, id))
    .map((id) => ({ id, label: labels[id] }));
}
function simulated(h) {
  return (
    h?.isMock === true ||
    h?.mock === true ||
    h?.simulated === true ||
    h?.verification?.simulated === true ||
    h?.provenance === "demo" ||
    h?.producer === "mock" ||
    /^Contenu généré pour l'univers .+ par Sofia\. Mode mock actif\s*[—-]\s*configurez AI_PROVIDER et AI_API_KEY pour une génération réelle\.$/i.test(
      String(h?.content ?? "").trim(),
    )
  );
}
export function adaptHarvests(input, projects) {
  if (!Array.isArray(input?.harvests))
    throw new Error("Harvest history missing");
  const allowed = new Set(projects.map((x) => x.id));
  const events = [];
  let rejectedCount = 0;
  for (const h of input.harvests) {
    // This exact suffix is written by saveHarvest in scripts/gerard-cycle.mjs.
    if (
      !/^gerard-cultivate-\d+-harvest$/.test(h?.harvestId) ||
      !allowed.has(h?.parcelId) ||
      h?.route !== "octopus->publisher-adapter" ||
      !["harvested", "ready-to-offer"].includes(h?.state) ||
      simulated(h) ||
      typeof h?.content !== "string" ||
      !h.content.trim() ||
      h.content.includes("SOURCE_EXTERNE_MANQUANTE")
    ) {
      rejectedCount++;
      continue;
    }
    events.push({
      id: "harvest:" + h.harvestId,
      missionId: h.harvestId.slice(0, -8),
      projectId: h.parcelId,
      agentRole: roleForCapabilities([h.capability]),
      title: "Récolte produite via Octopus et Publisher",
      type: "publisher.harvest.recorded",
      status: "completed",
      timestamp: h.harvestedAt,
      sourceSystem: "poulpe-fiction",
      sourceEventId: "harvest:" + h.harvestId,
      provenance: "real",
      resultKind: "harvest",
    });
  }
  const merged = mergeEvents([], events, "real");
  return {
    events: merged.events,
    rejectedCount: rejectedCount + merged.rejectedCount,
  };
}
export function buildFeed({
  seeds,
  state,
  harvests,
  octopus,
  sourceRef,
  observedAt,
}) {
  const projects = configuredProjects(seeds);
  const parts = [];
  const sources = [];
  for (const [id, input, adapter] of [
    ["gerard", state, adaptGerard],
    ["publisher-harvests", harvests, adaptHarvests],
    ["octopus", octopus, adaptOctopus],
  ]) {
    try {
      const part = adapter(input, projects);
      parts.push(part);
      const lastEventAt = part.events
        .map((e) => e.timestamp)
        .sort()
        .at(-1);
      sources.push({
        id,
        state: "available",
        observedAt,
        ...(lastEventAt ? { lastEventAt } : {}),
      });
    } catch {
      sources.push({ id, state: "unavailable", observedAt });
    }
  }
  if (sources.every((s) => s.state === "unavailable"))
    throw new Error("No readable source");
  return parseSnapshot({
    schemaVersion: 1,
    mode: "real",
    transport: "snapshot",
    coverage: "partial",
    generatedAt: observedAt,
    sourceRef,
    projects,
    sources,
    events: parts.flatMap((p) => p.events),
    rejectedCount: parts.reduce((n, p) => n + p.rejectedCount, 0),
  });
}
