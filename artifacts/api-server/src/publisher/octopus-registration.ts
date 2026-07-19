import { logger } from "../lib/logger";
import { PUBLISHER_ADAPTER_CAPABILITIES } from "./octopus-adapter";

const DEFAULT_OCTOPUS_URL = "https://octopus-engine.onrender.com";
const DEFAULT_REGISTRATION_REFRESH_MS = 60_000;

function publicBaseUrl(): string | undefined {
  const value = process.env.PUBLISHER_PUBLIC_URL ?? process.env.RENDER_EXTERNAL_URL;
  return value?.trim().replace(/\/$/, "") || undefined;
}

export async function registerPublisherWithOctopus(): Promise<void> {
  if (process.env.OCTOPUS_ADAPTER_REGISTRATION_ENABLED === "false") return;
  const publisherUrl = publicBaseUrl();
  if (!publisherUrl) {
    logger.warn("Publisher Octopus adapter not registered: PUBLISHER_PUBLIC_URL or RENDER_EXTERNAL_URL is missing");
    return;
  }

  const octopusUrl = (process.env.OCTOPUS_ENGINE_URL?.trim() || DEFAULT_OCTOPUS_URL).replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${octopusUrl}/adapters/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "publisher",
        name: "Blacklace Publisher",
        version: "1",
        capabilities: PUBLISHER_ADAPTER_CAPABILITIES,
        executeUrl: `${publisherUrl}/api/octopus-adapter/execute`,
        healthUrl: `${publisherUrl}/api/octopus-adapter/health`,
        metadata: { owner: "publisher", contract: "octopus-adapter-execution-v1" },
      }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      logger.error({ status: response.status, payload }, "Publisher adapter registration failed");
      return;
    }
    logger.info({ octopusUrl, capabilities: PUBLISHER_ADAPTER_CAPABILITIES }, "Publisher adapter registered with Octopus");
  } catch (error) {
    logger.error({ error }, "Publisher adapter registration could not reach Octopus");
  } finally {
    clearTimeout(timeout);
  }
}

export function schedulePublisherRegistration(): void {
  void registerPublisherWithOctopus();
  const intervalMs = Number(process.env.OCTOPUS_ADAPTER_REFRESH_MS ?? DEFAULT_REGISTRATION_REFRESH_MS);
  if (Number.isFinite(intervalMs) && intervalMs >= 60_000) {
    const timer = setInterval(() => void registerPublisherWithOctopus(), intervalMs);
    timer.unref();
  }
}
