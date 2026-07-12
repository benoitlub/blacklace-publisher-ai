# Publisher Garden boundary audit

## Status

Actionable migration map for issue #25.

This document classifies the current Publisher code that overlaps with Poulpe Fiction and the Garden domain. It does not change runtime behavior.

## Canonical boundary

Publisher owns:

- Radar;
- Observatoire;
- Serre for tool and knowledge observations;
- Knowledge Packs;
- Tool Packs;
- provider catalogue and evaluation;
- Connection Broker;
- OAuth, Composio, credentials and connected-account state;
- costs, credits, limits and alternatives;
- generic shared persistence;
- technical diagnostics and logs;
- generation services when called as capabilities by another application.

Poulpe Fiction owns:

- Gérard;
- parcels as a user-facing project/client/world model;
- Seeds, WIP and Harvest lifecycle;
- Garden activity and projection;
- adventure preparation and return;
- Harvest and Production Pack presentation;
- approval boundary before external actions.

Octopus Engine owns only neutral execution.

## File-by-file decisions

| Current file | Current responsibility | Decision | Destination / replacement | Removal condition |
|---|---|---|---|---|
| `artifacts/blacklace-publisher/src/lib/gardenWorker.ts` | Builds parcel reports, counts Seed/WIP/Harvest, creates Garden recommendations, persists them locally | **Deprecate then delete** | Poulpe Fiction Garden runtime and projection | Poulpe Fiction #19 reads remote Garden state and exposes equivalent activity/obstacle/Harvest information |
| `artifacts/blacklace-publisher/src/components/garden-report-panel.tsx` | Displays parcels and Garden metrics, mutates Seed lifecycle, creates HarvestDrafts, generates and edits PublicationDrafts | **Split** | Garden metrics/actions move to Poulpe Fiction; publication editing may remain as a Publisher production workspace only if still actively used | Garden lifecycle removed from component and no active page imports the old panel |
| `artifacts/blacklace-publisher/src/lib/missions.ts` | Mixes Publisher mission intake, fake Octopus response, Seed lifecycle, HarvestDraft lifecycle, publication generation and local activity log | **Split aggressively** | Keep generic publication draft generation and provider diagnostics in Publisher; move/remove parcel, Seed, WIP, Harvest and fake Octopus orchestration | Poulpe Fiction #19 has equivalent tested Garden lifecycle; neutral Octopus gateway exists |
| `artifacts/blacklace-publisher/src/lib/parcels.ts` | Creates and persists user-facing parcels locally in Publisher | **Deprecate as domain store** | Poulpe Fiction owns parcel schema and lifecycle; Publisher may keep only generic workspace/account filters if required by Publisher UI | All active Publisher screens stop using parcel CRUD as Garden authority |
| `artifacts/blacklace-publisher/src/pages/greenhouse.tsx` | Displays maturity of tool/knowledge observations | **Keep** | Publisher Serre | None; only ensure wording does not imply Gérard's project Garden |
| `artifacts/blacklace-publisher/src/pages/radar.tsx` | Discovers and surfaces signals/tools | **Keep** | Publisher Radar | None |
| `artifacts/blacklace-publisher/src/pages/observatory.tsx` | Curates and inspects observations | **Keep** | Publisher Observatoire | None |
| `artifacts/api-server/src/routes/knowledge-packs.ts` | Serves Knowledge Packs | **Keep** | Publisher API | None |
| `artifacts/api-server/src/routes/tool-packs.ts` | Serves Tool Packs | **Keep** | Publisher API | None |
| `artifacts/api-server/src/routes/global-state.ts` | Generic shared state persistence | **Keep with boundary note** | Publisher infrastructure service | Must not implement Seed/WIP/Harvest transition rules |
| generation routes such as `/api/generate/post` | Generates content through configured providers and reports diagnostics | **Keep as capability** | Publisher provider service | Must be called from Poulpe Fiction/Production workflow without owning Garden lifecycle |

## Detailed split of `missions.ts`

### Remove or move to Poulpe Fiction

- `MissionParcel` as Garden parcel identity;
- `ProposedSeed`;
- Seed statuses `seed`, `wip`, `harvest-draft`;
- `HarvestDraft` as a Publisher-owned lifecycle object;
- `OctopusMissionResponse` containing parcels and proposed Seeds;
- `ClientMission` fields that model fake Octopus and Garden lifecycle;
- fake local Octopus response and proposed Seed creation;
- `promoteFirstSeedToWip`;
- `prepareHarvestDraft`;
- local Garden activity entries such as `seed-created`, `recommendation-applied`, `harvest-draft-created`;
- `publisher-ai:missions`, `publisher-ai:harvest-drafts` and Garden lifecycle localStorage keys once migration is complete.

### May remain in Publisher after extraction

- `PublicationDraft` if Publisher still provides a production/editor workspace;
- `PublicationDiagnostic`;
- publication generation, renamed to accept a neutral content request or Production Pack artifact rather than a Publisher-owned HarvestDraft;
- provider/model/knowledge-source diagnostics;
- publication draft editing and status transitions;
- route `/api/generate/post` as a provider capability.

### Required adapter after split

The retained generation function should accept an input similar to:

```ts
interface PublicationGenerationInput {
  sourceArtifactId: string;
  title: string;
  summary: string;
  universe?: string;
  channel: string;
  knowledgePackId?: string;
}
```

It must not mutate Seed, WIP, Harvest or parcel state.

## Detailed split of `garden-report-panel.tsx`

### Delete from Publisher UI

- title `Rapport du jardin`;
- button `Faire jardiner le Poulpe`;
- local execution message `Octopus analyse...`;
- Seed/WIP/Harvest counters;
- recommendations `Promouvoir une graine en WIP` and `Préparer une récolte`;
- buttons applying Garden recommendations;
- HarvestDraft creation and listing as Garden state;
- any claim that opening or refreshing Publisher makes the Poulpe work.

### Optional retained production workspace

A new component may remain in Publisher only if it is clearly named and scoped, for example:

```text
Atelier de contenu
Brouillons de publication
Diagnostics de génération
```

It may:

- receive an artifact or Production Pack reference from Poulpe Fiction;
- generate a publication draft;
- show provider and knowledge diagnostics;
- allow text editing, copying and validation;
- request explicit authorization before external publication.

It may not:

- own parcels;
- promote Seeds;
- create Harvests;
- decide Garden recommendations;
- simulate Octopus activity.

## Detailed decision for `parcels.ts`

The current file defines default parcels such as Yael Bali, Blacklace and Benoît/Personnel and stores them in `localStorage`. This is a competing source of authority.

Migration rule:

1. Identify all active imports of `parcels.ts`.
2. Replace Garden-related use with IDs and labels supplied by Poulpe Fiction or generic remote state.
3. If Publisher needs a filter for observations by universe/client, introduce a neutral `WorkspaceReference` or `ContextReference` only after proving that it is not a renamed Garden parcel.
4. Remove parcel CRUD from Publisher once no active consumer remains.

Do not copy these default parcels into a new Publisher store.

## Local storage keys to retire

After migration and one optional compatibility release:

```text
publisher-ai:garden-report
publisher-ai:missions
publisher-ai:harvest-drafts
publisher-ai:parcels
publisher-ai:activity
```

`publisher-ai:publication-drafts` may remain only if the publication editor remains an active Publisher feature.

A compatibility reader may import old drafts once, but must not continue writing both old and new schemas.

## UI rename map

| Current wording | Target wording |
|---|---|
| Garden when referring to keys/configuration/runtime diagnostics | Local technique |
| Rapport du jardin | Remove from Publisher |
| Faire jardiner le Poulpe | Remove from Publisher |
| Serre Publisher | Keep |
| Radar | Keep |
| Observatoire | Keep |
| HarvestDraft in production editor | Source artifact or Production Pack input |

## Safe implementation order

1. Add deprecation notices and identify imports.
2. Extract the optional publication editor from `garden-report-panel.tsx` into a neutral production component.
3. Point that component at Production Pack/artifact input instead of HarvestDraft ownership.
4. Stop rendering `GardenReportPanel` in Publisher navigation/pages.
5. Stop writing Garden lifecycle localStorage keys.
6. Keep compatibility reads for one migration release only if needed.
7. Delete `gardenWorker.ts` and Garden-only functions from `missions.ts`.
8. Remove `parcels.ts` after all active imports are gone.
9. Rename infrastructure UI to `Local technique`.
10. Run typecheck, frontend tests, API tests and build.

## Non-regression guard

The migration must not modify or recreate:

- Knowledge Pack API;
- Tool Pack API;
- Connection Broker;
- Composio connections;
- provider catalogue;
- Mistral configuration;
- generic global-state service;
- Radar, Observatoire or Serre semantics.

## Completion criteria

Publisher is clean when:

- no active component promotes a Seed, creates WIP or prepares a Harvest;
- no Publisher page claims to make the Poulpe garden;
- no local Publisher store is authoritative for parcels;
- publication generation is a neutral capability receiving an artifact/Production Pack input;
- all infrastructure/configuration screens display `Local technique`;
- Knowledge Packs, Tool Packs, Broker, providers, Radar, Observatoire and Serre still work.
