/**
 * Windsor Amazon Ads read-only normalization layer.
 * Does not query Windsor, store credentials, or change an advertising campaign.
 * Pending/empty reports must NOT be interpreted as zero spend.
 */
export type WindsorReportState = "pending" | "unavailable" | "ready" | "error";
export type AmazonAdsSnapshot = {
  contract: "amazon-ads-snapshot-v1";
  provider: "windsor";
  campaign: string;
  date: string;
  status: WindsorReportState;
  impressions: number | null;
  clicks: number | null;
  spend: number | null;
  attributedUnits14d: number | null;
  attributedSales14d: number | null;
  royaltyPerUnit: number;
  estimatedRoyaltyReturn: number | null;
  estimatedProfitAfterAds: number | null;
};

const campaignField = "sponsored_products_campaign__campaign";
const impressionsField = "sponsored_products_campaign__impressions";
const clicksField = "sponsored_products_campaign__clicks";
const costField = "sponsored_products_campaign__cost";
const unitsField = "sponsored_products_campaign__attributedunitsordered14d";
const salesField = "sponsored_products_campaign__attributedsales14d";

function numberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function normalizeWindsorAmazonAds(
  report: { status?: "pending" | "done"; data?: Record<string, unknown>[] | null; error?: string },
  date: string,
  campaign = "LVI-Test-France-Oct2026",
  royaltyPerUnit = 5,
): AmazonAdsSnapshot {
  const rows = report.data?.filter((r) => r[campaignField] === campaign && (!r.date || r.date === date)) ?? [];
  const state: WindsorReportState = report.error ? "error"
    : report.status === "pending" ? "pending"
    : rows.length === 0 ? "unavailable" : "ready";
  const sum = (key: string): number | null => {
    if (state !== "ready") return null;
    const values = rows.map((row) => numberOrNull(row[key]));
    return values.every((v) => v !== null) ? values.reduce<number>((a, b) => a + (b ?? 0), 0) : null;
  };
  const spend = sum(costField);
  const units = sum(unitsField);
  const royalty = units === null ? null : units * royaltyPerUnit;
  return {
    contract: "amazon-ads-snapshot-v1",
    provider: "windsor",
    campaign, date, status: state,
    impressions: sum(impressionsField),
    clicks: sum(clicksField),
    spend,
    attributedUnits14d: units,
    attributedSales14d: sum(salesField),
    royaltyPerUnit,
    estimatedRoyaltyReturn: royalty,
    estimatedProfitAfterAds: royalty === null || spend === null ? null : royalty - spend,
  };
}
