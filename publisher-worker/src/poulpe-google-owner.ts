// Google Identity Services web client for Poulpe Fiction. The ID is public.
const CLIENT_ID = "692850297482-75umdcti8d45u0gr146h9egd1l7ah2uv.apps.googleusercontent.com";
const OWNER_EMAIL_SHA256 = "f2bd83068b3cadd8eb14c7cdfb93c623378097b37a2f8468695e2e5c246b36f9";
const GOOGLE_KEYS = "https://www.googleapis.com/oauth2/v3/certs";

type GoogleKey = JsonWebKey & { kid: string };
let cachedKeys: { keys: GoogleKey[]; expiresAt: number } | undefined;
let pendingKeys: Promise<GoogleKey[]> | undefined;

function decode(input: string): Uint8Array<ArrayBuffer> {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
}

async function googleKeys(): Promise<GoogleKey[]> {
  if (cachedKeys && cachedKeys.expiresAt > Date.now()) return cachedKeys.keys;
  pendingKeys ??= (async () => {
    const response = await fetch(GOOGLE_KEYS, {
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("Google signing keys unavailable");
    const body = await response.json() as { keys: GoogleKey[] };
    if (!Array.isArray(body.keys)) throw new Error("Invalid Google signing keys");
    const ttl = Number(/(?:^|,\s*)max-age=(\d+)/i.exec(response.headers.get("Cache-Control") ?? "")?.[1] ?? "60");
    cachedKeys = { keys: body.keys, expiresAt: Date.now() + Math.min(ttl, 3600) * 1000 };
    return cachedKeys.keys;
  })().finally(() => { pendingKeys = undefined; });
  return pendingKeys;
}

/** Return the signed expiry for the one authorized Gmail account. */
export async function verifyPoulpeOwner(token: string): Promise<number | null> {
  if (token.length > 8192 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) return null;
  try {
    const [headerPart, payloadPart, signature] = token.split(".");
    const decoder = new TextDecoder();
    const header = JSON.parse(decoder.decode(decode(headerPart)));
    const claims = JSON.parse(decoder.decode(decode(payloadPart)));
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== "RS256" || typeof header.kid !== "string" ||
        !["https://accounts.google.com", "accounts.google.com"].includes(claims.iss) ||
        claims.aud !== CLIENT_ID || (claims.azp !== undefined && claims.azp !== CLIENT_ID) ||
        !Number.isSafeInteger(claims.exp) || claims.exp <= now ||
        !Number.isSafeInteger(claims.iat) || claims.iat > now + 60 ||
        typeof claims.sub !== "string" || !claims.sub ||
        claims.email_verified !== true || typeof claims.email !== "string") return null;
    const encoder = new TextEncoder();
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(claims.email.toLowerCase()));
    const emailHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    if (emailHash !== OWNER_EMAIL_SHA256) return null;
    const jwk = (await googleKeys()).find(key =>
      key.kid === header.kid && key.kty === "RSA" && key.use === "sig" && key.alg === "RS256");
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    }, false, ["verify"]);
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5", key, decode(signature), encoder.encode(headerPart + "." + payloadPart),
    );
    return valid ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}
