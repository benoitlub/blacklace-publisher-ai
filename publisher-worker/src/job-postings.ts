const jobSources: Record<string, RegExp> = {
  "candidat.francetravail.fr": /^\/offres\/recherche\/detail\/[a-z0-9]+\/?$/i,
  "www.hellowork.com": /^\/fr-fr\/emplois\/\d+\.html$/,
  "www.welcometothejungle.com": /^\/fr\/companies\/[\w-]+\/jobs\/[\w-]+\/?$/,
};

function jobUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.port || url.username || url.password ||
        !Object.hasOwn(jobSources, url.hostname) || !jobSources[url.hostname].test(url.pathname)) return null;
    return new URL(url.pathname, url.origin);
  } catch {
    return null;
  }
}

type Json = Record<string, unknown>;
const record = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [value];
const plain = (value: unknown, max = 200) => typeof value === "string"
  ? value.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&").replace(/&eacute;/g, "é").replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ").trim().slice(0, max) : "";

function findPosting(value: unknown): Json | undefined {
  for (const entry of list(value)) {
    const node = record(entry);
    if (list(node["@type"]).includes("JobPosting")) return node;
    const graph = list(node["@graph"]).map(record);
    const posting = graph.find(item => list(item["@type"]).includes("JobPosting"));
    if (posting) return posting;
  }
}

function salaryText(salary: unknown): string {
  const amount = record(salary);
  const rate = record(amount.value);
  const number = (value: unknown) => typeof value === "number" && value > 0 && Number.isFinite(value) ? value : null;
  const low = number(rate.minValue);
  const high = number(rate.maxValue);
  const exact = number(rate.value ?? amount.value);
  const display = exact ?? (low && high && low <= high ? `${low}–${high}` : null);
  return display === null ? "" : [display, plain(amount.currency, 8), plain(rate.unitText, 20)].filter(Boolean).join(" ");
}

export function parseJobPosting(html: string, url: string, now = Date.now()) {
  const closed = /(?:cette offre (?:n.est plus disponible|a expiré|est pourvue)|les candidatures sont closes|no longer accepting applications)/i;
  if (closed.test(html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " "))) return null;
  const source = jobUrl(url);
  if (!source) return null;
  for (const script of html.matchAll(/<script\b[^>]*\btype\s*=\s*["']application\/ld(?:\+|&#x2b;|&#43;)json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    let job: Json | undefined;
    try { job = findPosting(JSON.parse(script[1])); } catch { continue; }
    if (!job) continue;
    const declaredUrl = plain(job.url, 1000);
    if (declaredUrl && jobUrl(declaredUrl)?.href !== source.href) continue;
    const expires = plain(job.validThrough);
    if (expires && (!Number.isFinite(Date.parse(expires)) || Date.parse(expires) < now)) continue;
    const title = plain(job.title);
    const employer = plain(record(job.hiringOrganization).name);
    const description = plain(job.description, 12_000);
    if (!title || !employer || !description) continue;
    const location = list(job.jobLocation).map(item => {
      const address = record(record(item).address);
      return [plain(address.addressLocality), plain(address.postalCode, 12)].filter(Boolean).join(" ");
    }).filter(Boolean).slice(0, 5).join(" / ");
    const contact = plain(record(job.applicationContact).email);
    const contract = `${title} ${description}`.match(/\b(?:CDI|CDD)\b/i)?.[0].toUpperCase();
    const employmentType = [contract, ...list(job.employmentType).map(item => plain(item, 60))]
      .filter(Boolean);
    const hours = plain(job.workHours, 100) || title.match(/\b\d{1,2}\s*h\b/i)?.[0] || "";
    return {
      title, employer, url: source.href, location,
      employmentType: [...new Set(employmentType)].join(" / "), hours,
      remote: job.jobLocationType === "TELECOMMUTE",
      salary: salaryText(job.baseSalary),
      applicationEmail: /^[\w.+-]+@[\w-]+(?:\.[\w-]+)+$/.test(contact) ? contact : null,
      snippet: description, verification: "source-opened",
    };
  }
  return null;
}

async function readPage(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let size = 0;
  let html = "";
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) return html + decoder.decode();
      size += part.value.byteLength;
      if (size > 2_000_000) return "";
      html += decoder.decode(part.value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export async function verifyJobPostings(
  candidates: { url: string }[],
  fetcher: typeof fetch = fetch,
) {
  const urls = [...new Set(candidates.map(item => jobUrl(item.url)?.href).filter(Boolean) as string[])].slice(0, 8);
  let opened = 0;
  const jobs = await Promise.all(urls.map(async url => {
    try {
      const response = await fetcher(url, { redirect: "error", signal: AbortSignal.timeout(6000) });
      if ([404, 410].includes(response.status)) { opened++; return null; }
      if (!response.ok || !response.headers.get("Content-Type")?.includes("text/html")) return null;
      const html = await readPage(response);
      if (!html) return null;
      opened++;
      return parseJobPosting(html, url);
    } catch {
      return null;
    }
  }));
  return { jobs: jobs.filter(job => job !== null), attempted: urls.length, opened };
}
