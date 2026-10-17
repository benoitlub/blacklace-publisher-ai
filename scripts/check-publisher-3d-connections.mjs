/**
 * Read-only probe for Publisher's currently DEPLOYED Composio connections.
 * GitHub logs must never disclose Composio account IDs, secret names or tokens.
 * No 3D generation is requested. Failure is displayed as unavailable.
 */
const url = "https://blacklace-publisher-worker.benoitlubert.workers.dev/api/production/diagnostics";
const result = { endpoint: "publisher-production-diagnostics", inspection: "read-only", status: "unknown",
  provider3d: { meshy: "unknown", tripo3d: "unknown" } };
try {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(18000),
  });
  result.httpStatus = response.status;
  if (!response.ok) {
    result.status = "unavailable";
  } else {
    const data = await response.json();
    const c = data?.composio;
    // A missing or failed Composio inventory is UNKNOWN, not disconnected.
    if (c?.configured === false) {
      result.status = "composio-unconfigured";
      result.provider3d.meshy = "not-connected";
      result.provider3d.tripo3d = "not-connected";
    } else if (c?.configured === true && Array.isArray(c?.connectedAccounts)) {
      result.status = "inventory-confirmed";
      const slugs = new Set(c.connectedAccounts
        .filter(item => ["ACTIVE", "CONNECTED", "SUCCESS", "ENABLED"].includes(
          String(item?.status || "").toUpperCase()))
        .map(item => String(item?.toolkitSlug || "").toLowerCase().replace(/[^a-z0-9]/g, "")));
      result.provider3d.meshy = slugs.has("meshy") ? "connected" : "not-connected";
      result.provider3d.tripo3d = slugs.has("tripo3d") || slugs.has("tripo") ? "connected" : "not-connected";
      result.creditBalance = "not-checked";
    } else {
      result.status = "unexpected-inventory-response";
    }
  }
} catch (e) {
  result.status = "unreachable";
  result.errorType = e?.name === "TimeoutError" ? "timeout" : "network-or-json";
}
console.log("Publisher 3D provider inventory (sanitized):", JSON.stringify(result));
