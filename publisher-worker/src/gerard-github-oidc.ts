/**
 * Authenticate the one-off owner-mail test from a trusted GitHub Actions job.
 * No stored bearer secret is required: GitHub signs short-lived OIDC JWTs.
 */
const ISSUER = "https://token.actions.githubusercontent.com";
const AUDIENCE = "blacklace-publisher-gerard-owner-test";
const REPOSITORY = "benoitlub/poulpe-fiction";
const WORKFLOW = "benoitlub/poulpe-fiction/.github/workflows/gerard-owner-publisher-mail-test.yml@refs/heads/main";

function decodeBase64Url(input: string): Uint8Array {
  const binary = atob(input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "="));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export async function verifyGerardGithubOidc(jwt: string): Promise<boolean> {
  if (!jwt || jwt.length > 16000) return false;
  const sections = jwt.split(".");
  if (sections.length !== 3) return false;
  try {
    const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(sections[0]))) as Record<string, unknown>;
    const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(sections[1]))) as Record<string, unknown>;
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== "RS256" || typeof header.kid !== "string") return false;
    if (claims.iss !== ISSUER || claims.aud !== AUDIENCE ||
        claims.repository !== REPOSITORY || claims.ref !== "refs/heads/main" ||
        claims.workflow_ref !== WORKFLOW || claims.event_name !== "push" ||
        claims.sub !== "repo:benoitlub/poulpe-fiction:ref:refs/heads/main" ||
        typeof claims.exp !== "number" || claims.exp <= now ||
        typeof claims.iat !== "number" || claims.iat > now + 60 ||
        typeof claims.nbf === "number" && claims.nbf > now + 60) return false;
    const response = await fetch("https://token.actions.githubusercontent.com/.well-known/jwks", {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return false;
    const payload = await response.json() as { keys?: Array<Record<string, unknown>> };
    const jwk = payload.keys?.find(key => key.kid === header.kid && key.kty === "RSA" && key.use === "sig");
    if (!jwk) return false;
    const key = await crypto.subtle.importKey("jwk", jwk as JsonWebKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    return crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decodeBase64Url(sections[2]), new TextEncoder().encode(sections[0] + "." + sections[1]));
  } catch {
    return false;
  }
}
