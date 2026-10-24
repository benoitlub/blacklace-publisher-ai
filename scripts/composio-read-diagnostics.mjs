// Read-only production evidence from a runner allowed by Cloudflare. Never
// execute a provider tool, expose credentials/account IDs, or change a connection.
import { writeFile } from "node:fs/promises";
const base = "https://blacklace-publisher-worker.benoitlubert.workers.dev";
const checks = [];
const snapshots = new Map();
for (const endpoint of [
  "/api/adapter/health",
  "/api/observatory/discovery/account",
  "/api/observatory/discovery/schema",
]) {
  try {
    const response = await fetch(base + endpoint, {
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    const raw = await response.text();
    let body = {};
    try {
      body = JSON.parse(raw);
    } catch {}
    if (response.ok) snapshots.set(endpoint, body);
    checks.push({
      endpoint,
      httpStatus: response.status,
      status: body.status ?? "unavailable",
      ...(body.capabilities ? { capabilities: body.capabilities } : {}),
      ...(typeof body.configured === "boolean"
        ? { configured: body.configured }
        : {}),
      ...(typeof body.userIdConfigured === "boolean"
        ? { userIdConfigured: body.userIdConfigured }
        : {}),
      ...(Array.isArray(body.searchAccounts)
        ? {
            searchAccountCount: body.searchAccounts.length,
            activeSearchAccounts: body.searchAccounts.filter(
              (a) => a.active === true,
            ).length,
          }
        : {}),
      ...(Array.isArray(body.tools)
        ? {
            tools: body.tools.map((t) => ({
              slug: t.slug,
              toolkit: t.toolkit,
              inputSchema: t.inputSchema,
            })),
            toolCount: body.tools.length,
          }
        : {}),
      ...(!response.ok
        ? {
            providerHttpStatus:
              Number(String(body.error ?? "").match(/Composio (\d{3})/)?.[1]) ||
              null,
          }
        : {}),
      executed: false,
    });
  } catch {
    checks.push({ endpoint, status: "unreachable", executed: false });
  }
}
const report = {
  observedAt: new Date().toISOString(),
  mode: "read-only-metadata",
  providerExecutions: 0,
  checks,
};
// Validate the patched planner against the actual, read-only metadata. Account
// identifiers remain in memory and are never emitted. This cannot execute a tool.
if (
  process.env.COMPOSIO_VALIDATE_METADATA === "true" &&
  snapshots.has("/api/observatory/discovery/schema") &&
  snapshots.has("/api/observatory/discovery/account")
) {
  const { executeBusinessSearch } =
    await import("../publisher-worker/src/composio-discovery.ts");
  const schemas =
    snapshots.get("/api/observatory/discovery/schema").tools ?? [];
  const accounts =
    snapshots.get("/api/observatory/discovery/account").searchAccounts ?? [];
  const plan = await executeBusinessSearch(
    {
      query: "Distributeurs B2B Europe, sources publiques",
      operationId: "read-only-production-metadata-probe",
      dryRun: true,
      authorized: false,
    },
    {
      userId: "metadata-replay",
      request: async (route) => {
        if (route.includes("connected_accounts"))
          return {
            items: accounts.map((a) => ({
              id: a.id,
              status: a.status,
              toolkit: { slug: a.toolkit },
              user_id: "metadata-replay",
            })),
          };
        if (route.startsWith("/tools?"))
          return {
            items: schemas.map((t) => ({
              slug: t.slug,
              name: t.name,
              description: t.description,
              toolkit: { slug: t.toolkit },
              input_parameters: t.inputSchema,
            })),
          };
        throw new Error(
          "Provider execution forbidden during metadata validation",
        );
      },
    },
  );
  report.readOnlyPlan = {
    status: plan.status,
    reason: plan.reason ?? null,
    selectedTool: plan.selectedTool ?? null,
    executed: false,
    trace: plan.trace,
    mode: "replay-of-real-deployed-metadata",
  };
}
if (process.env.COMPOSIO_DIAGNOSTIC_PATH)
  await writeFile(
    process.env.COMPOSIO_DIAGNOSTIC_PATH,
    JSON.stringify(report, null, 2) + "\n",
  );
console.log("COMPOSIO_PRODUCTION_DIAGNOSTIC " + JSON.stringify(report));
