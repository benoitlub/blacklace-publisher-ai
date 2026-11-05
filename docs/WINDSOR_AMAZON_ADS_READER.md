# Windsor Amazon Ads reader — isolated staging

The file `publisher-worker/src/windsor-amazon-ads.ts` normalizes report data supplied by an authorized Windsor.ai read. It **does not fetch** reports, install secrets, or change live campaigns.

Confirmed source: Windsor `amazon_ads`, account `Sponsored ads - Author`. Initial 2026-10-19 report returned `done` with an empty array and must be classified as `unavailable`, **not** as 0 clicks or 0 EUR spend.

## Required before runtime integration

1. Confirm Windsor's external API/export contract and credentials separately from the ChatGPT Windsor connector.
2. Store credentials in Cloudflare Worker secrets (never committed).
3. Implement authenticated read-only retrieval in Publisher with pagination/pending handling and timestamped snapshots.
4. Validate actual field payload shape; test empty, pending, error and valid records. Never double count cumulative rows.
5. Expose snapshots to Gérard without modifying existing Garden scheduling.
6. Monitor 20/25/30 EUR spending thresholds. Notifications alone cannot guarantee a hard cap or pause a campaign.

Book: Les Vacances Interdites, ASIN B0HJNC4GQK; campaign LVI-Test-France-Oct2026, Oct 19–25, royalty benchmark 5 EUR per book. See issue #135.
