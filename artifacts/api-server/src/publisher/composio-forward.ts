// One server implementation: the existing Worker owns Composio credentials,
// schemas, account scoping, operation ledger and read policy. Express is a relay.
export interface ComposioMissionResult {
  operationId?: string;
  status: "completed" | "failed" | "needs-input";
  summary?: string;
  output: Record<string, any>;
}

export async function forwardComposioMission(
  envelope: unknown,
  options: { workerUrl: string; fetchImpl?: typeof fetch },
): Promise<ComposioMissionResult> {
  let httpStatus: number | undefined;
  try {
    const response = await (options.fetchImpl ?? fetch)(
      `${options.workerUrl.replace(/\/$/, "")}/api/octopus-adapter/execute`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(envelope),
        signal: AbortSignal.timeout(55000),
      },
    );
    httpStatus = response.status;
    const raw: unknown = await response.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new Error("INVALID_RESPONSE");
    const data = raw as Record<string, any>;
    const expected = (envelope as { mission?: { operationId?: unknown } })
      ?.mission?.operationId;
    if (typeof expected === "string" && data?.operationId !== expected)
      throw new Error("UNCORRELATED_RESULT");
    if (
      !response.ok ||
      !data ||
      typeof data !== "object" ||
      !["completed", "needs-input", "failed"].includes(data.status) ||
      !data.output ||
      typeof data.output !== "object" ||
      Array.isArray(data.output)
    )
      throw new Error();
    return data as ComposioMissionResult;
  } catch {
    return {
      status: "needs-input" as const,
      summary:
        "Le transport Composio du Worker est indisponible ; aucun résultat inventé.",
      output: {
        status: "blocked",
        reason: "PUBLISHER_COMPOSIO_UNAVAILABLE",
        candidates: [],
        executed: false,
        retryAllowed: false,
        ...(httpStatus ? { httpStatus } : {}),
      },
    };
  }
}
