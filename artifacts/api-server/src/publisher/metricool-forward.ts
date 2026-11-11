// Request a fresh identity only inside the existing trusted Production workflow.
export async function productionPublicationToken({env = process.env, fetchImpl = fetch}: {
  env?: Record<string,string|undefined>; fetchImpl?: typeof fetch;
} = {}): Promise<string|null> {
  if (env.GITHUB_WORKFLOW_REF !== "benoitlub/poulpe-fiction/.github/workflows/gerard-production.yml@refs/heads/main" ||
      !env.ACTIONS_ID_TOKEN_REQUEST_URL || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) return null;
  const url = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
  if (url.protocol !== "https:") return null;
  url.searchParams.set("audience","blacklace-publisher-gerard-production-publish");
  const response = await fetchImpl(url,{headers:{Authorization:"Bearer "+env.ACTIONS_ID_TOKEN_REQUEST_TOKEN},signal:AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error("GITHUB_PUBLICATION_IDENTITY_UNAVAILABLE");
  const result = await response.json() as {value?:unknown};
  if (typeof result.value !== "string" || !result.value) throw new Error("GITHUB_PUBLICATION_IDENTITY_UNAVAILABLE");
  return result.value;
}

// The existing local Publisher adapter supplies Metricool through the Worker.
// Credentials stay server-side; neither Gerard nor Octopus receives the bearer.
export async function forwardMetricoolPublication(
  publication: Record<string, unknown>,
  options: { workerUrl: string; token?: string; bufferToken?: string; fetchImpl?: typeof fetch; getToken?: () => Promise<string|null> },
): Promise<Record<string, unknown>> {
  const dryRun = publication.dryRun !== false;
  const transport = publication.transport ?? "metricool";
  if (transport !== "metricool" && transport !== "buffer") return { status: "rejected", stage: "destination", reason: "UNKNOWN_TRANSPORT", scheduled: false };
  let token = transport === "buffer" ? options.bufferToken : options.token;
  if (!dryRun && transport === "metricool" && !token) {
    try { token = (await (options.getToken ?? (() => productionPublicationToken({fetchImpl:options.fetchImpl})))()) ?? undefined; }
    catch { return {status:"blocked",stage:"authorization",reason:"GITHUB_PUBLICATION_IDENTITY_UNAVAILABLE",scheduled:false,published:false}; }
  }
  if ((!dryRun || transport === "buffer") && !token) return { status: "blocked", stage: "authorization", reason: transport === "buffer" ? "BUFFER_DRAFT_WRITE_TOKEN_MISSING" : "METRICOOL_EXECUTION_TOKEN_MISSING", scheduled: false };
  try {
    const response = await (options.fetchImpl ?? fetch)(`${options.workerUrl.replace(/\/$/, "")}/api/social/publication/finalize`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ ...publication, dryRun }), signal: AbortSignal.timeout(90000),
    });
    const data: unknown = await response.json();
    if (!response.ok || !data || typeof data !== "object" || Array.isArray(data)) throw new Error("Unconfirmed response");
    return data as Record<string, unknown>;
  } catch {
    // Timeout may follow a successful write. Retry only the same operation ID;
    // the Worker's durable reservation must reconcile it without another write.
    return { status: "confirmation-required", stage: "publisher-transport", reason: "PUBLISHER_RESPONSE_UNCONFIRMED", scheduled: false, retryAllowed: false };
  }
}
