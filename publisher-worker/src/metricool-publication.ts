// Metricool's execution path, invoked by the existing Octopus adapter. The
// provider and existing global-state persistence are injected at their boundaries.
export type Network = "facebook" | "instagram" | "youtube";
export interface Publication {
  operationId: string; harvestId: string; text: string; media: string[];
  networks: Network[]; brandId: string; timezone: string; youtube?: Record<string, unknown> | null;
}
export interface ProviderPost {
  id: string; text: string; media: string[]; networks: string[];
  date: string; status: "scheduled" | "published" | "draft" | "failed";
}
export interface Brand { id: string; label: string; timezone: string; networks: string[] }
export interface Reservation {
  operationId: string; fingerprint: string; copyHash: string; mediaHash: string;
  harvestId: string; networks: string[]; month: string; date: string;
  state: "pending" | "unknown" | "scheduled" | "published"; postId?: string;
}
export interface PublicationState { version: number; reservations: Reservation[] }
export interface PublicationStore {
  read(): Promise<PublicationState>;
  compareAndSet(version: number, reservations: Reservation[]): Promise<boolean>;
}
export interface MetricoolProvider {
  brand(): Promise<Brand>;
  // These methods must return complete provider data or throw, never a partial
  // page or a local/manual snapshot. Every enabled brand network is covered.
  published(start: string, end: string, networks: string[]): Promise<ProviderPost[]>;
  scheduled(start: string, end: string, timezone: string): Promise<ProviderPost[]>;
  bestTimes(start: string, end: string, network: string, timezone: string): Promise<Array<{ dayOfWeek: number; hour: number; value: number }>>;
  schedule(date: string, info: Record<string, unknown>): Promise<string>;
}
export class MetricoolBlocked extends Error {
  constructor(readonly code: string, readonly stage: string, readonly retryAfterSeconds?: number) { super(code); }
}
export function blocked(code: string, stage: string): never { throw new MetricoolBlocked(code, stage); }
export const normalizeCopy = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();
export async function digest(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
}
export function localDateTime(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const p = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}
// Reject nonexistent/ambiguous wall-clock slots during DST transitions.
export function wallClockInstant(value: string, timezone: string): number | null {
  const wall = Date.parse(value + "Z");
  if (!Number.isFinite(wall)) return null;
  const options = new Set<number>();
  for (const day of [-1, 0, 1]) {
    const probe = wall + day * 86400000;
    const offset = Date.parse(localDateTime(new Date(probe), timezone) + "Z") - probe;
    const candidate = wall - offset;
    if (localDateTime(new Date(candidate), timezone) === value) options.add(candidate);
  }
  return options.size === 1 ? [...options][0] : null;
}
export function monthWindow(now: Date, timezone: string) {
  const month = localDateTime(now, timezone).slice(0, 7);
  const [year, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return { month, start: `${month}-01`, end: `${month}-${last}` };
}
export function verifiedBudget(used: number, reserved: number, networks: readonly string[]) {
  const requestedUnits = new Set(networks).size;
  if (![used, reserved].every(v => Number.isSafeInteger(v) && v >= 0)) blocked("QUOTA_INVALID", "verified-budget");
  return { limit: 20, used, reserved, requestedUnits, projectedUsed: used + reserved + requestedUnits,
    remaining: Math.max(0, 20 - used - reserved), allowed: requestedUnits > 0 && used + reserved + requestedUnits <= 20,
    accountingUnit: "provider-network-item-including-queued", source: "metricool-via-composio", verified: true };
}
export function isPublicMediaUrl(value: string): boolean {
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    return u.protocol === "https:" && !u.username && !u.password && !u.port &&
      host.includes(".") && !/^[\d.]+$/.test(host) && !host.includes(":") &&
      !/(^|\.)(localhost|local|internal|invalid|test)$/.test(host) && !u.hash;
  } catch { return false; }
}

export interface PublicationResult {
  status: string; stage: string; scheduled: boolean; published: boolean;
  operationId: string; harvestId: string; postId?: string; publicationDate?: string;
  reason?: string; retryAfterSeconds?: number; budget?: ReturnType<typeof verifiedBudget>;
  retryAllowed: boolean;
}
function result(input: Publication, status: string, stage: string, extra: Partial<PublicationResult> = {}): PublicationResult {
  return { status, stage, scheduled: false, published: false, operationId: input.operationId, harvestId: input.harvestId, retryAllowed: false, ...extra };
}
function exactPost(post: ProviderPost, input: Publication, date?: string): boolean {
  return normalizeCopy(post.text) === normalizeCopy(input.text) &&
    JSON.stringify([...post.networks].sort()) === JSON.stringify([...input.networks].sort()) &&
    JSON.stringify([...post.media].sort()) === JSON.stringify([...input.media].sort()) &&
    (!date || post.date === date);
}
async function reconcile(
  input: Publication, entry: Reservation, posts: ProviderPost[], state: PublicationState, store: PublicationStore, persist = true,
): Promise<PublicationResult> {
  const matches = posts.filter(post => (entry.postId ? post.id === entry.postId : exactPost(post, input, entry.date)) && exactPost(post, input, entry.date));
  if (matches.length !== 1) return result(input, "confirmation-required", "provider-confirmation", { reason: "PROVIDER_RESULT_UNCONFIRMED", postId: entry.postId });
  const post = matches[0];
  if (post.status !== "scheduled" && post.status !== "published") return result(input, "confirmation-required", "provider-status", { reason: `PROVIDER_${post.status.toUpperCase()}`, postId: post.id });
  const saved = !persist || await store.compareAndSet(state.version, state.reservations.map(r => r.operationId === entry.operationId ? { ...r, state: post.status as "scheduled" | "published", postId: post.id } : r));
  if (!saved) return result(input, "confirmation-required", "persistence", { reason: "STATUS_SAVE_CONFLICT", postId: post.id });
  return result(input, post.status === "published" ? "confirmed-published" : "confirmed-scheduled", "provider-confirmation", {
    scheduled: post.status === "scheduled", published: post.status === "published", postId: post.id, publicationDate: post.date,
  });
}

export async function executeMetricoolPublication(input: Publication, deps: {
  provider: MetricoolProvider; store: PublicationStore;
  verifyMedia: (url: string) => Promise<string>;
  now?: Date; dryRun: boolean; enabled: boolean; authorized: boolean;
}): Promise<PublicationResult> {
  let stage = "authorization";
  try {
    if (!deps.dryRun && (!deps.enabled || !deps.authorized)) blocked("METRICOOL_EXECUTION_DISABLED_OR_UNAUTHORIZED", stage);
    if (!input.operationId || !input.harvestId || !input.networks.length || input.networks.some(n => !["facebook", "instagram", "youtube"].includes(n)) ||
      (!input.text.trim() && !input.media.length)) blocked("INVALID_PUBLICATION", "editorial-validation");
    if ((input.networks.includes("instagram") || input.networks.includes("youtube")) && !input.media.length) blocked("MEDIA_REQUIRED", "media");
    if (input.networks.includes("youtube") && (!input.youtube?.title || typeof input.youtube.madeForKids !== "boolean")) blocked("YOUTUBE_METADATA_REQUIRED", "media");
    stage = "connection";
    const brand = await deps.provider.brand();
    if (brand.id !== input.brandId || brand.timezone !== input.timezone || !["pro-hbtd", "prohbtd"].includes(brand.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))) blocked("BRAND_IDENTITY_MISMATCH", "destination");
    if (input.networks.some(n => !brand.networks.includes(n))) blocked("NETWORK_NOT_CONNECTED", "destination");
    const now = deps.now ?? new Date();
    const window = monthWindow(now, brand.timezone);
    stage = "persistence";
    const state = await deps.store.read();
    const copyHash = await digest(normalizeCopy(input.text));
    const mediaHash = await digest([...input.media].sort());
    const fingerprint = await digest([input.brandId, copyHash, mediaHash, [...input.networks].sort(), input.harvestId]);
    const previous = state.reservations.find(r => r.operationId === input.operationId);
    if (previous && previous.fingerprint !== fingerprint) blocked("OPERATION_ID_CONFLICT", "idempotency");
    stage = "provider-history";
    // A retry of an older operation reads the period actually reserved.
    const historyStart = previous ? previous.date.slice(0, 7) + "-01" : window.start;
    const scheduled = await deps.provider.scheduled(historyStart, window.end, brand.timezone);
    if (previous) return reconcile(input, previous, scheduled, state, deps.store, !deps.dryRun);
    if (state.reservations.some(r => r.copyHash === copyHash && r.networks.some(n => input.networks.includes(n as Network)))) blocked("LOCAL_DUPLICATE_OR_UNCERTAIN_REQUEST", "idempotency");
    const published = await deps.provider.published(window.start, window.end, brand.networks);
    const posts = [...published, ...scheduled].filter(p => ["published", "scheduled"].includes(p.status));
    if (posts.some(p => normalizeCopy(p.text) === normalizeCopy(input.text) && p.networks.some(n => input.networks.includes(n as Network)))) blocked("PROVIDER_DUPLICATE", "deduplication");
    const unitKeys = new Set<string>();
    for (const p of posts.filter(p => p.date.slice(0, 7) === window.month)) {
      for (const network of p.networks) unitKeys.add(`${network}:${p.id}`);
    }
    const reserved = state.reservations.filter(r => r.month === window.month).reduce((sum, r) => sum + r.networks.filter(network => !r.postId || !unitKeys.has(`${network}:${r.postId}`)).length, 0);
    let budget = verifiedBudget(unitKeys.size, reserved, input.networks);
    if (!budget.allowed) return result(input, "quota-exhausted", "verified-budget", { budget, reason: "MONTHLY_LIMIT_REACHED" });
    stage = "media";
    for (const url of input.media) {
      if (!isPublicMediaUrl(url)) blocked("INVALID_MEDIA_URL", stage);
      const mime = (await deps.verifyMedia(url)).split(";")[0].trim().toLowerCase();
      if (!/^(image\/(png|jpeg|webp)|video\/(mp4|quicktime|webm))$/.test(mime) || (input.networks.includes("youtube") && !mime.startsWith("video/"))) blocked("MEDIA_TYPE_UNSUPPORTED", stage);
    }
    stage = "best-time";
    const start = localDateTime(now, brand.timezone).slice(0, 10);
    const end = [localDateTime(new Date(now.getTime() + 6 * 86400000), brand.timezone).slice(0, 10), window.end].sort()[0];
    const heatmaps = await Promise.all(input.networks.map(n => deps.provider.bestTimes(start, end, n, brand.timezone)));
    const candidates: Array<{ date: string; instant: number; score: number }> = [];
    const firstDay = Date.parse(start + "T00:00:00Z");
    for (let day = 0; day < 7; day++) {
      const calendar = new Date(firstDay + day * 86400000);
      const date = calendar.toISOString().slice(0, 10);
      if (date > end) break;
      for (let hour = 0; hour < 24; hour++) {
        const wall = `${date}T${String(hour).padStart(2, "0")}:00:00`;
        const instant = wallClockInstant(wall, brand.timezone);
        if (instant === null || instant <= now.getTime() + 15 * 60000) continue;
        const scores = heatmaps.map(rows => rows.find(r => r.dayOfWeek === calendar.getUTCDay() + 1 && r.hour === hour)?.value);
        if (scores.some(v => typeof v !== "number" || !Number.isFinite(v))) continue;
        const reservedDates = state.reservations.map(r => r.date);
        if ([...posts.map(p => p.date), ...reservedDates].some(d => {
          const other = wallClockInstant(d, brand.timezone);
          return other === null || Math.abs(other - instant) < 4 * 3600000;
        })) continue;
        candidates.push({ date: wall, instant, score: Math.min(...scores as number[]) });
      }
    }
    candidates.sort((a, b) => b.score - a.score || a.instant - b.instant);
    const selected = candidates[0];
    if (!selected) blocked("NO_VERIFIED_BEST_TIME", stage);
    if (deps.dryRun) return result(input, "ready-to-schedule", "dry-run", { budget, publicationDate: selected.date, retryAllowed: true });
    const entry: Reservation = { operationId: input.operationId, harvestId: input.harvestId, fingerprint, copyHash, mediaHash,
      networks: [...input.networks], month: window.month, date: selected.date, state: "pending" };
    stage = "idempotency";
    if (!await deps.store.compareAndSet(state.version, [...state.reservations, entry])) blocked("RESERVATION_CONFLICT", stage);
    // Media checks/best-time reads can take time. Recheck live provider state
    // and all local reservations at the last possible point before the write.
    // If this preflight fails, removing our own reservation is safe because no
    // scheduling request has yet been sent. A failed CAS keeps it conservatively.
    let reservedState = await deps.store.read();
    try {
      stage = "verified-budget";
      const live = [...await deps.provider.published(window.start, window.end, brand.networks),
        ...await deps.provider.scheduled(window.start, window.end, brand.timezone)].filter(p => ["published", "scheduled"].includes(p.status));
      const keys = new Set(live.filter(p => p.date.slice(0, 7) === window.month).flatMap(p => p.networks.map(n => `${n}:${p.id}`)));
      reservedState = await deps.store.read();
      if (!reservedState.reservations.some(r => r.operationId === input.operationId && r.fingerprint === fingerprint && r.state === "pending")) blocked("RESERVATION_LOST", "idempotency");
      const otherReserved = reservedState.reservations.filter(r => r.operationId !== input.operationId && r.month === window.month)
        .reduce((sum, r) => sum + r.networks.filter(n => !r.postId || !keys.has(`${n}:${r.postId}`)).length, 0);
      const finalBudget = verifiedBudget(keys.size, otherReserved, input.networks);
      budget = finalBudget;
      if (!finalBudget.allowed) blocked("MONTHLY_LIMIT_CHANGED", stage);
      if (live.some(p => normalizeCopy(p.text) === normalizeCopy(input.text) && p.networks.some(n => input.networks.includes(n as Network)))) blocked("PROVIDER_DUPLICATE", "deduplication");
      if (live.some(p => {
        const instant = wallClockInstant(p.date, brand.timezone);
        return instant === null || Math.abs(instant - selected.instant) < 4 * 3600000;
      })) blocked("PROVIDER_CALENDAR_CHANGED", "best-time");
    } catch (error) {
      await deps.store.compareAndSet(reservedState.version, reservedState.reservations.filter(r => r.operationId !== input.operationId)).catch(() => false);
      throw error;
    }
    // No retries or alternative tools after crossing this write boundary.
    stage = "provider-write";
    let postId: string;
    try {
      const info: Record<string, unknown> = { autoPublish: true, draft: false, descendants: [], firstCommentText: "", hasNotReadNotes: false,
        media: input.media, mediaAltText: [], providers: input.networks.map(network => ({ network })),
        publicationDate: { dateTime: selected.date, timezone: brand.timezone }, shortener: false, smartLinkData: { ids: [] }, text: input.text };
      if (input.networks.includes("facebook")) info.facebookData = { type: "POST" };
      if (input.networks.includes("instagram")) info.instagramData = { type: "POST" };
      if (input.networks.includes("youtube")) info.youtubeData = input.youtube;
      postId = await deps.provider.schedule(selected.date, info);
    } catch {
      // The durable pending reservation already prevents another write even if
      // this best-effort status update fails or the Worker is terminated.
      await deps.store.compareAndSet(reservedState.version, reservedState.reservations.map(r => r.operationId === input.operationId ? { ...r, state: "unknown" } : r)).catch(() => false);
      return result(input, "confirmation-required", stage, { reason: "PROVIDER_WRITE_UNCERTAIN" });
    }
    const updated: PublicationState = { version: reservedState.version, reservations: reservedState.reservations.map(r => r.operationId === input.operationId ? { ...r, postId } : r) };
    // Persist the returned ID before attempting the verification read.
    if (!await deps.store.compareAndSet(updated.version, updated.reservations)) return result(input, "confirmation-required", "persistence", { reason: "POST_ID_SAVE_CONFLICT", postId });
    updated.version++;
    stage = "provider-confirmation";
    const fresh = await deps.provider.scheduled(window.start, window.end, brand.timezone);
    return { ...await reconcile(input, updated.reservations.find(r => r.operationId === input.operationId)!, fresh, updated, deps.store), budget };
  } catch (error) {
    const known = error instanceof MetricoolBlocked ? error : null;
    return result(input, stage === "provider-confirmation" || stage === "persistence" ? "confirmation-required" : "blocked", known?.stage ?? stage,
      { reason: known?.code ?? "DEPENDENCY_UNAVAILABLE", ...(known?.retryAfterSeconds ? { retryAfterSeconds: known.retryAfterSeconds } : {}) });
  }
}
