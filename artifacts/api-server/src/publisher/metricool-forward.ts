// The existing local Publisher adapter supplies Metricool through the Worker.
// Credentials stay server-side; neither Gerard nor Octopus receives the bearer.
export async function forwardMetricoolPublication(
  publication: Record<string, unknown>,
  options: { workerUrl: string; token?: string; bufferToken?: string; fetchImpl?: typeof fetch },
): Promise<Record<string, unknown>> {
  const dryRun = publication.dryRun !== false;
  const transport = publication.transport ?? "metricool";
  if (transport !== "metricool" && transport !== "buffer") return { status: "rejected", stage: "destination", reason: "UNKNOWN_TRANSPORT", scheduled: false };
  const token = transport === "buffer" ? options.bufferToken : options.token;
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
