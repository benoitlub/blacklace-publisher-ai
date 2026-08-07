const DEFAULT_OCTOPUS_ENGINE_URL = "https://octopus-engine-app.benoitlubert.workers.dev";

export type OctopusMissionPayload = Record<string, unknown>;
export type OctopusMissionResult = Record<string, unknown>;

function baseUrl(): string {
  return String(process.env["OCTOPUS_ENGINE_URL"] || DEFAULT_OCTOPUS_ENGINE_URL)
    .trim()
    .replace(/\/$/, "");
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 500) };
  }
}

export async function sendMissionToOctopus(
  payload: OctopusMissionPayload,
): Promise<OctopusMissionResult> {
  const response = await fetch(`${baseUrl()}/mission`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Octopus-Caller": "blacklace-publisher",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(90_000),
  });

  const result = await readPayload(response);

  if (!response.ok) {
    const message =
      result && typeof result === "object" && "message" in result
        ? String(result.message)
        : result && typeof result === "object" && "error" in result
          ? String(result.error)
          : `Octopus Engine HTTP ${response.status}`;

    throw new Error(message);
  }

  return result && typeof result === "object"
    ? (result as OctopusMissionResult)
    : { result };
}

export async function checkOctopusHealth(): Promise<OctopusMissionResult> {
  const response = await fetch(`${baseUrl()}/health`, {
    headers: { "X-Octopus-Caller": "blacklace-publisher" },
    signal: AbortSignal.timeout(15_000),
  });

  const result = await readPayload(response);
  if (!response.ok) throw new Error(`Octopus Engine HTTP ${response.status}`);

  return result && typeof result === "object"
    ? (result as OctopusMissionResult)
    : { result };
}
