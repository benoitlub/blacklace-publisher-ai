import test from "node:test";
import assert from "node:assert/strict";
import { normalizeWindsorAmazonAds } from "../windsor-amazon-ads";

const campaign = "LVI-Test-France-Oct2026";
const prefix = "sponsored_products_campaign__";

test("pending report never masquerades as zero spend", () => {
  const result = normalizeWindsorAmazonAds({ status: "pending" }, "2026-10-19");
  assert.equal(result.status, "pending");
  assert.equal(result.spend, null);
  assert.equal(result.estimatedProfitAfterAds, null);
});

test("completed empty report means unavailable, not zero", () => {
  const result = normalizeWindsorAmazonAds({ status: "done", data: [] }, "2026-10-19");
  assert.equal(result.status, "unavailable");
  assert.equal(result.clicks, null);
  assert.equal(result.attributedUnits14d, null);
});

test("fully observed row can correctly contain zero results", () => {
  const result = normalizeWindsorAmazonAds({
    status: "done",
    data: [{ date: "2026-10-19", [prefix + "campaign"]: campaign,
      [prefix + "cost"]: 0, [prefix + "clicks"]: 0,
      [prefix + "impressions"]: 10, [prefix + "attributedunitsordered14d"]: 0,
      [prefix + "attributedsales14d"]: 0 }],
  }, "2026-10-19");
  assert.equal(result.status, "ready");
  assert.equal(result.spend, 0);
  assert.equal(result.impressions, 10);
  assert.equal(result.estimatedProfitAfterAds, 0);
});

test("filters out other campaigns and dates", () => {
  const row = { date: "2026-10-19", [prefix + "campaign"]: campaign,
    [prefix + "cost"]: 1.2, [prefix + "clicks"]: 8,
    [prefix + "impressions"]: 100, [prefix + "attributedunitsordered14d"]: 1,
    [prefix + "attributedsales14d"]: 13.61 };
  const result = normalizeWindsorAmazonAds({ status: "done", data: [
    row, { ...row, date: "2026-10-18" },
    { ...row, [prefix + "campaign"]: "OTHER" },
  ] }, "2026-10-19");
  assert.equal(result.status, "ready");
  assert.equal(result.spend, 1.2);
  assert.equal(result.estimatedRoyaltyReturn, 5);
  assert.equal(result.estimatedProfitAfterAds, 3.8);
});

test("missing metrics are unknown, not zero", () => {
  const result = normalizeWindsorAmazonAds({ status: "done", data: [
    { date: "2026-10-19", [prefix + "campaign"]: campaign },
  ] }, "2026-10-19");
  assert.equal(result.status, "ready");
  assert.equal(result.spend, null);
  assert.equal(result.estimatedProfitAfterAds, null);
});

test("explicit provider error is not reported as zero spend", () => {
  const result = normalizeWindsorAmazonAds({ error: "timeout" }, "2026-10-19");
  assert.equal(result.status, "error");
  assert.equal(result.spend, null);
});
