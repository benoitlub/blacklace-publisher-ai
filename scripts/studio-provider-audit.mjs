import { writeFile } from "node:fs/promises";
const base = "https://blacklace-publisher-worker.benoitlubert.workers.dev";
const checks = [];
for (const endpoint of [
  "/api/production/diagnostics",
  "/api/production/mistral-image-pack",
  "/api/adapter/health",
]) {
  try {
    const response = await fetch(base + endpoint, {
      signal: AbortSignal.timeout(20000),
      redirect: "error",
    });
    let j = {};
    try {
      j = await response.json();
    } catch {}
    checks.push({
      endpoint,
      httpStatus: response.status,
      ...(endpoint.endsWith("diagnostics")
        ? {
            mistralConfigured: j.mistral?.configured ?? null,
            canvaConnected: j.composio?.canvaConnected ?? null,
            canvaStatus: j.canva?.status ?? null,
            canvaToolCount: j.canva?.discoveredToolCount ?? null,
            canvaCandidates:
              j.canva?.generativeCandidates?.map((t) => t.slug) ?? [],
            elevenLabsConnected: j.composio?.elevenLabsConnected ?? null,
          }
        : {}),
      ...(endpoint.endsWith("mistral-image-pack")
        ? {
            configured: j.configured ?? null,
            status: j.status ?? "unavailable",
          }
        : {}),
      ...(endpoint.endsWith("/health")
        ? { capabilities: j.capabilities ?? [] }
        : {}),
      providerExecutions: 0,
    });
  } catch {
    checks.push({ endpoint, status: "unreachable", providerExecutions: 0 });
  }
}
const report = {
  observedAt: new Date().toISOString(),
  mode: "metadata-only-no-provider-generation",
  checks,
  providerExecutions: 0,
};
if (process.env.STUDIO_AUDIT_PATH)
  await writeFile(
    process.env.STUDIO_AUDIT_PATH,
    JSON.stringify(report, null, 2) + "\n",
  );
console.log("STUDIO_PROVIDER_AUDIT " + JSON.stringify(report));
