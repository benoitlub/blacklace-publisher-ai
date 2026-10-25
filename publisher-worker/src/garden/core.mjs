export const roles = Object.freeze({
  cueilleur: "Cueilleur",
  tresseur: "Tresseur",
  enlumineur: "Enlumineur",
  passeur: "Passeur",
  greffeur: "Greffeur",
  jardinier: "Jardinier de fond",
  semeur: "Semeur",
});
export const statuses = Object.freeze({
  queued: "En attente",
  running: "En cours",
  completed: "Terminée",
  failed: "Échouée",
  blocked: "Bloquée",
  retrying: "Reprise en cours",
});
const record = (v) =>
  v && typeof v === "object" && !Array.isArray(v) ? v : {};
const string = (v) =>
  typeof v === "string" && v.length > 0 && v.length <= 300 ? v : undefined;
const timestamp = (v) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d\d:\d\d)$/.test(v) &&
  Number.isFinite(Date.parse(v));
const key = (...parts) => parts.map(encodeURIComponent).join(":");
const own = (o, k) => Object.hasOwn(o, k);
export function safeResultUrl(value) {
  try {
    const u = new URL(value);
    // Explicit public artifact hosts; signed links and credentials never leave the adapter.
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.search ||
      u.hash
    )
      return undefined;
    if (!["benoitlub.github.io", "www.canva.com"].includes(u.hostname))
      return undefined;
    return u.href;
  } catch {
    return undefined;
  }
}
export function validateEvent(input, mode) {
  const e = record(input);
  if (e.provenance !== mode || !["real", "demo"].includes(mode)) return null;
  if (
    mode === "real" &&
    (e.sourceSystem === "demo" ||
      String(e.id).startsWith("demo-") ||
      String(e.missionId).startsWith("demo-"))
  )
    return null;
  if (
    ![
      "id",
      "missionId",
      "projectId",
      "title",
      "type",
      "sourceSystem",
      "sourceEventId",
    ].every((k) => string(e[k]))
  )
    return null;
  if (
    !own(roles, e.agentRole) ||
    !own(statuses, e.status) ||
    !timestamp(e.timestamp)
  )
    return null;
  // Rebuild an allowlist, never spread an upstream object into browser data.
  const out = Object.fromEntries(
    [
      "id",
      "missionId",
      "projectId",
      "agentRole",
      "title",
      "type",
      "status",
      "timestamp",
      "sourceSystem",
      "sourceEventId",
      "provenance",
    ].map((k) => [k, e[k]]),
  );
  if (Number.isSafeInteger(e.sequence) && e.sequence >= 0)
    out.sequence = e.sequence;
  if (["internal-cycle", "harvest", "publication"].includes(e.resultKind))
    out.resultKind = e.resultKind;
  const url = safeResultUrl(e.resultUrl);
  if (url && e.status === "completed") out.resultUrl = url;
  if (["blocked", "failed"].includes(e.status))
    out.errorMessage =
      e.status === "failed"
        ? "L’exécution a échoué. Consulter la trace source."
        : "Une condition requise empêche la progression.";
  return out;
}
export function mergeEvents(previous, incoming, mode) {
  const entries = new Map();
  let rejectedCount = 0;
  for (const raw of [...previous, ...incoming]) {
    const e = validateEvent(raw, mode);
    if (!e) {
      rejectedCount++;
      continue;
    }
    const id = key(e.sourceSystem, e.sourceEventId);
    if (entries.has(id)) {
      if (JSON.stringify(entries.get(id)) !== JSON.stringify(e))
        rejectedCount++;
      continue; // First observed event is immutable; conflicting duplicates cannot rewrite it.
    }
    entries.set(id, e);
  }
  const events = [...entries.values()].sort(
    (a, b) =>
      Date.parse(a.timestamp) - Date.parse(b.timestamp) ||
      (a.sequence ?? 0) - (b.sequence ?? 0) ||
      a.id.localeCompare(b.id),
  );
  return { events, rejectedCount };
}
export function projectMissions(events, mode) {
  const missions = new Map();
  for (const e of mergeEvents([], events, mode).events) {
    const id = key(e.sourceSystem, e.missionId);
    const old = missions.get(id);
    const history = [...(old?.history ?? []), e];
    missions.set(id, {
      id,
      projectId: e.projectId,
      agentRole: e.agentRole,
      title: e.title,
      status: e.status,
      currentStep: e.type,
      ...(old?.startedAt
        ? { startedAt: old.startedAt }
        : e.status === "running"
          ? { startedAt: e.timestamp }
          : {}),
      ...(e.status === "completed" ? { completedAt: e.timestamp } : {}),
      lastEventAt: e.timestamp,
      sourceSystem: e.sourceSystem,
      sourceEventId: e.sourceEventId,
      provenance: e.provenance,
      ...(e.resultUrl
        ? { resultUrl: e.resultUrl }
        : e.status === "completed" && old?.resultUrl
          ? { resultUrl: old.resultUrl }
          : {}),
      ...(e.resultKind
        ? {
            resultKind:
              e.status === "completed" &&
              e.resultKind === "internal-cycle" &&
              old?.resultKind === "harvest"
                ? "harvest"
                : e.resultKind,
          }
        : {}),
      ...(e.errorMessage ? { errorMessage: e.errorMessage } : {}),
      history,
    });
  }
  return [...missions.values()].sort((a, b) =>
    b.lastEventAt.localeCompare(a.lastEventAt),
  );
}
/** A phase is an observed state, not a fabricated percentage or timer. */
export function visualState(mission) {
  return {
    route: ["running", "retrying", "blocked", "failed"].includes(
      mission.status,
    ),
    moving: ["running", "retrying"].includes(mission.status),
    blocked: ["blocked", "failed"].includes(mission.status),
    delivered: mission.status === "completed",
  };
}
export function parseSnapshot(input, expectedMode = "real") {
  const s = record(input);
  if (
    s.schemaVersion !== 1 ||
    s.mode !== expectedMode ||
    s.transport !== "snapshot" ||
    s.coverage !== "partial" ||
    !timestamp(s.generatedAt) ||
    !string(s.sourceRef) ||
    !Array.isArray(s.events) ||
    !Array.isArray(s.projects)
  )
    throw new Error("Flux du jardin invalide");
  const projects = s.projects
    .filter((p) => string(p?.id) && string(p?.label))
    .map((p) => ({ id: p.id, label: p.label }));
  const allowed = new Set(projects.map((p) => p.id));
  const merged = mergeEvents([], s.events, expectedMode);
  const events = merged.events.filter((e) => allowed.has(e.projectId));
  return {
    schemaVersion: 1,
    mode: expectedMode,
    transport: "snapshot",
    coverage: "partial",
    generatedAt: s.generatedAt,
    sourceRef: s.sourceRef,
    projects,
    events,
    ...(Array.isArray(s.sources)
      ? {
          sources: s.sources
            .filter(
              (x) =>
                string(x?.id) &&
                ["available", "unavailable"].includes(x?.state) &&
                timestamp(x?.observedAt),
            )
            .map((x) => ({
              id: x.id,
              state: x.state,
              observedAt: x.observedAt,
              ...(timestamp(x.lastEventAt)
                ? { lastEventAt: x.lastEventAt }
                : {}),
            })),
        }
      : {}),
    rejectedCount:
      merged.rejectedCount +
      merged.events.length -
      events.length +
      (Number.isSafeInteger(s.rejectedCount) && s.rejectedCount > 0
        ? s.rejectedCount
        : 0),
  };
}
const octopusStatuses = {
  "mission.received": "queued",
  "mission.recorded": "queued",
  "mission.planned": "queued",
  "mission.waiting-executor": "blocked",
  "mission.executing": "running",
  "mission.waiting-authorization": "blocked",
  "mission.completed": "completed",
  "mission.failed": "failed",
  "mission.rejected": "failed",
};
export function roleForCapabilities(capabilities) {
  const map = {
    "knowledge.search": "cueilleur",
    "observation.receive": "cueilleur",
    "content.generate": "tresseur",
    "copy.generate": "tresseur",
    "image.generate": "enlumineur",
    "video.generate": "enlumineur",
    "data.transfer": "passeur",
    "integration.repair": "greffeur",
    "archive.clean": "jardinier",
    "social.publish": "semeur",
  };
  return (
    (Array.isArray(capabilities) ? capabilities : [])
      .map((c) => map[c])
      .find(Boolean) ?? "passeur"
  );
}
/** Called in a trusted collector, never on an unfiltered browser response. */
export function adaptOctopus(input, projects) {
  if (!Array.isArray(input?.events)) throw new Error("Octopus events absent");
  const allowed = new Set(projects.map((p) => p.id));
  let rejectedCount = 0;
  const events = [];
  for (const raw of input.events) {
    const e = record(raw),
      p = record(e.payload);
    if (
      !own(octopusStatuses, e.kind) ||
      !string(e.id) ||
      !string(e.streamId) ||
      !allowed.has(p.contextId) ||
      !timestamp(e.occurredAt) ||
      e.source === "demo" ||
      [e, p, record(p.output), record(record(p.output).verification)].some(
        (value) =>
          value.provenance === "demo" ||
          value.mode === "demo" ||
          value.mock === true ||
          value.isMock === true ||
          value.simulated === true ||
          value.provider === "mock",
      )
    ) {
      rejectedCount++;
      continue;
    }
    const event = validateEvent(
      {
        id: key("octopus", e.id),
        missionId: e.streamId,
        projectId: p.contextId,
        agentRole: roleForCapabilities(p.requiredCapabilities),
        title: "Mission Octopus",
        type: e.kind,
        status: octopusStatuses[e.kind],
        timestamp: e.occurredAt,
        sourceSystem: "octopus-engine",
        sourceEventId: e.id,
        provenance: "real",
        sequence: e.sequence,
        resultKind: "internal-cycle",
      },
      "real",
    );
    if (event) events.push(event);
    else rejectedCount++;
  }
  return { events: mergeEvents([], events, "real").events, rejectedCount };
}
/** Uses the audited learningHistory, not browser GardenStore or inferred activity. */
export function adaptGerard(input, projects) {
  if (!Array.isArray(input?.learningHistory))
    throw new Error("Historique Gérard absent");
  const allowed = new Set(projects.map((p) => p.id));
  const events = [];
  let rejectedCount = 0;
  for (const e of input.learningHistory) {
    const projectId = e?.parcelId || "poulpe-fiction";
    let status = {
      ok: "completed",
      completed: "completed",
      failed: "failed",
      "waiting-authorization": "blocked",
      "waiting-executor": "blocked",
      queued: "queued",
      running: "running",
    }[e?.outcome];
    if (
      ["ai-rate-limited-deferred", "mock-rejected-deferred"].includes(
        e?.decision,
      )
    )
      status = "blocked";
    if (
      !status ||
      !string(e.operationId) ||
      !timestamp(e.at) ||
      !allowed.has(projectId) ||
      e.mock === true ||
      e.simulated === true ||
      e.provenance === "demo"
    ) {
      rejectedCount++;
      continue;
    }
    const agentRole =
      {
        cultivate: "tresseur",
        symbiosis: "jardinier",
        dream: "cueilleur",
        play: "cueilleur",
      }[e.mode] ?? "passeur";
    const sourceEventId = key(e.operationId, e.at, e.outcome);
    events.push(
      validateEvent(
        {
          id: key("gerard", sourceEventId),
          missionId: e.operationId,
          projectId,
          agentRole,
          title: roles[agentRole] + " · cycle de Gérard",
          type: "gerard." + e.outcome,
          status,
          timestamp: e.at,
          sourceSystem: "poulpe-fiction",
          sourceEventId,
          provenance: "real",
          resultKind: "internal-cycle",
        },
        "real",
      ),
    );
  }
  return { events: mergeEvents([], events, "real").events, rejectedCount };
}
