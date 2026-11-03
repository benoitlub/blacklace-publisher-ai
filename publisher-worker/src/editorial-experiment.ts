/** Non-blocking editorial experiment planner. No scheduling or publishing side effects. */
export type EditorialCategory = 'entertainment' | 'behindTheScenes' | 'promotion';
export type EditorialAsset = { id?: string | null; originalId?: string | null; category?: string | null; status?: string | null };
export type EditorialObservation = { verified?: boolean; transportId?: string | null; metrics?: Record<string, number | null> | null };
export const EDITORIAL_TARGETS: Readonly<Record<EditorialCategory, number>> = Object.freeze({ entertainment: 60, behindTheScenes: 25, promotion: 15 });
export const EXPERIMENT_WINDOW_DAYS = 30;
export const CATEGORY_NAMES: readonly EditorialCategory[] = Object.freeze(['entertainment', 'behindTheScenes', 'promotion']);
/**
 * Count original creative assets, not cross-posts. Never edits queued posts.
 * input: [{id, originalId?, category, status?}]
 */
export function editorialMix(assets: EditorialAsset[] = []) {
  const seen = new Set<string>();
  const counts: Record<EditorialCategory, number> = { entertainment: 0, behindTheScenes: 0, promotion: 0 };
  for (const asset of assets) {
    const id = asset?.originalId ?? asset?.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const category = asset.category;
    if (typeof category === 'string' && Object.prototype.hasOwnProperty.call(counts, category)) counts[category as EditorialCategory]++;
  }
  const measured = Object.values(counts).reduce((a, b) => a + b, 0);
  return {
    target: { ...EDITORIAL_TARGETS },
    counts,
    measured,
    percentages: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, measured ? Math.round(100 * v / measured) : null])),
    advisoryOnly: true,
    queueChanges: 0,
  };
}
/** Advisory next theme; returns null if no creative assets available. Never gates publishing. */
export function suggestEditorialCategory(assets: EditorialAsset[] = []) {
  const mix = editorialMix(assets);
  return CATEGORY_NAMES.map(category => ({
    category,
    gap: EDITORIAL_TARGETS[category] * (mix.measured + 1) / 100 - mix.counts[category],
  })).sort((a, b) => b.gap - a.gap)[0].category;
}
/** Treat missing or unattributed metrics as inconclusive, not poor performance. */
export function classifyExperimentObservation(observation: EditorialObservation | null | undefined) {
  if (!observation?.verified || !observation?.transportId || !observation?.metrics || !Object.values(observation.metrics).some(v => typeof v === "number" && Number.isFinite(v) && v >= 0)) {
    return "inconclusive";
  }
  return "measured-not-causal";
}
