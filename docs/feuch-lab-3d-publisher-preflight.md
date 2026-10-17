# Feuch Lab / Creature-Sync — Publisher → Octopus 3D preflight

## Goal
Reuse **Publisher** (provider discovery/connection brokerage) and **Octopus** (neutral mission orchestration) for the first Creature-Sync GLB model. Do not create a parallel billable service or modify Gérard's normal publishing cycles.

## What is actually implemented (non-production feature branch)
- `GET /api/production/3d/preflight?imageCount=4`: read-only 3D Tool Pack readiness check.
- `POST /api/production/3d/plan`: body `{"title":"Creature-Sync Console","imageCount":4,"format":"glb"}`; returns a dry-run plan and connection evidence only.
- `asset.3d.plan`: new **Publisher Octopus adapter** capability; returns the same preflight through the existing neutral `POST /mission` contract. This capability produces *planning data only*.
- Meshy multi-view (`MESHY_CREATE_IMAGE_TO_3D_TASK`) is preferred when four views are supplied; Tripo single image (`TRIPO3D_GENERATE_MODEL_FROM_IMAGE`) is listed as a one-view fallback only.
- The Composio API key already on Publisher (if configured) is **not** evidence of a Meshy/Tripo connected account. The broker checks accounts through the existing connected-account inventory. A positive connection is not proof of credits or entitlement.
- No provider execution route, no paid task request, no GLB promise, no automatic subscription, no deployment, no secret changes.

## Mission contract (planned example)
```json
{
  "operationId": "creature-sync-glb-plan-001",
  "title": "Creature-Sync Console",
  "objective": "Prepare GLB reconstruction from four orthogonal concept views; no paid execution.",
  "requiredCapabilities": ["asset.3d.plan"],
  "authorizedResources": [],
  "context": {
    "id": "feuch-lab-creature-sync",
    "label": "metaverse-creator",
    "metadata": { "imageCount": 4, "format": "glb", "source": "Feuch Lab" }
  }
}
```

## Next gate (deliberately not implemented yet)
A real mesh requires a provider or local 3D modeling. To reuse Publisher's Composio broker for actual Meshy or Tripo execution, verify:
1. Publisher Worker deployed separately from production publishing, with Composio connection for the chosen provider.
2. Provider credits verified independently. Meshy image-to-3D consumes credits; do not confuse an available action with free usage.
3. Explicit consent for one specific generation and an enforceable quota/rate limit (prefer a separate, authenticated trigger).
4. Secure image transfer, asynchronous job polling, GLB download, artifact retention, and test that no paid calls run when access is disabled.
5. A Metaverse Creator adapter targeting Publisher's authenticated 3D execution rather than a duplicate direct Meshy API key.
6. Preserve Publisher and Octopus interfaces used by Gérard, Metricool, 420 Dice and the other apps.

## Note on visual references
The 4 concept views are still AI renderings, not guaranteed mathematically matched orthographic drawings. Before any billable generation, inspect their rear/side consistency. Do not claim the resulting mesh will replicate every detail.

## Actual deployed Provider check — 2026-10-17

A non-mutating GitHub Actions check (`scripts/check-publisher-3d-connections.mjs`)
called the *deployed* Publisher Worker endpoint `GET /api/production/diagnostics`.

- HTTP 200; active Composio connected-account inventory read successfully.
- Meshy: **not connected**.
- Tripo3D: **not connected**.
- Provider credits: **not checked**.
- Endpoint makes no GLB and does not change provider configuration.
- CI validations: 16 targeted tests passed; overall repository CI passed.
- Current work remains isolated in this draft PR, with no deployment.

**Do not activate paid Meshy calls until account and credit approval.** Meshy's
published API pricing documents 20 credits for 3D reconstruction without
textures, generally 30 with textures for standard models, and Meshy states
that API access requires Pro or higher. This may entail a separate purchase.
Sources: https://www.meshy.ai/api and https://docs.meshy.ai/en/api/pricing

**Next actionable gate:** inspect existing accessible free/paid 3D alternatives
and ask the user whether to connect a dedicated provider account to Publisher.
Connecting Composio through another ChatGPT session is not automatically the
same identity or credentials as Publisher's worker. Do not assume otherwise.
