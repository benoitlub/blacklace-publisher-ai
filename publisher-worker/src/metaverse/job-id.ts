/**
 * A job id encodes `provider|providerJobId` as base64url.
 *
 * This is what keeps the service stateless: job state lives with the provider,
 * not here. No database is needed to resume a job between two requests, and any
 * Worker isolate can serve any job id.
 */

const SEPARATOR = "|";

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

export function encodeJobId(provider: string, providerJobId: string): string {
  if (provider.includes(SEPARATOR)) {
    throw new Error(`Provider name must not contain "${SEPARATOR}"`);
  }
  return toBase64Url(`${provider}${SEPARATOR}${providerJobId}`);
}

export interface DecodedJobId {
  provider: string;
  providerJobId: string;
}

export function decodeJobId(jobId: string): DecodedJobId {
  let decoded: string;

  try {
    decoded = fromBase64Url(jobId);
  } catch {
    throw new Error("Malformed job id");
  }

  const index = decoded.indexOf(SEPARATOR);

  if (index <= 0 || index === decoded.length - 1) {
    throw new Error("Malformed job id");
  }

  return {
    provider: decoded.slice(0, index),
    providerJobId: decoded.slice(index + 1),
  };
}
