/** Keyless search/fetch. Public documentation: https://docs.keenable.ai/guides/keyless-access */
const headers = { "Content-Type": "application/json", "X-Keenable-Title": "Blacklace Publisher" };
export async function searchPublicWeb(query: string, fetcher: typeof fetch = fetch) {
  if (!query.trim() || query.length > 1200) throw new Error("invalid-search-query");
  const response = await fetcher("https://api.keenable.ai/v1/search/public", {
    method: "POST", headers, body: JSON.stringify({ query, max_results: 8 }),
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`public-search-http-${response.status}`);
  const payload = await response.json() as { results?: Record<string, unknown>[] };
  if (!Array.isArray(payload.results)) throw new Error("invalid-search-response");
  return { data: { citations: payload.results.slice(0, 8).filter(r => typeof r.url === "string" && /^https?:\/\//i.test(r.url)).map(r => ({
    title: String(r.title ?? ""), url: String(r.url), description: String(r.description || r.snippet || ""),
  })) }, engine: "keenable-public", executable: false };
}
export async function fetchPublicPage(url: string, maxChars = 16000, fetcher: typeof fetch = fetch) {
  const target = new URL(url);
  if (!["http:", "https:"].includes(target.protocol) || target.username || target.password ||
      /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[|172\.(1[6-9]|2\d|3[01])\.)/i.test(target.hostname)) throw new Error("public-url-required");
  const params = new URLSearchParams({ url: target.href, max_chars: String(Math.min(16000, Math.max(1, maxChars))) });
  const response = await fetcher(`https://api.keenable.ai/v1/fetch/public?${params}`, { headers, signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`public-fetch-http-${response.status}`);
  const payload = await response.json() as { content?: string; title?: string };
  if (typeof payload.content !== "string" || !payload.content.trim()) throw new Error("public-page-empty");
  return { data: { url: target.href, title: payload.title ?? "", content: payload.content.slice(0, maxChars) }, engine: "keenable-public" };
}
