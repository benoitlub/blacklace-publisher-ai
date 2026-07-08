# Repo status — 2026-07-08

## Etat de production

- Render est revenu au vert pour les trois services : `blacklace-publisher-web`, `blacklace-publisher-api`, `blacklace-publisher-db`.
- Le blocage Render venait de `pnpm-workspace.yaml` : `allowBuilds` pointait vers un tarball `octopus-engine@https://...` au lieu du nom de package.
- Correction appliquee sur `main` : `octopus-engine: true`.

## Correctifs appliques sur main

1. `fix(pnpm): allow octopus-engine build by package name`
   - Remplace l'autorisation PNPM figée sur un tarball par le nom de package `octopus-engine`.

2. `fix(ai): auto-enable Mistral when key is configured`
   - Si `MISTRAL_API_KEY` est présente et `AI_PROVIDER` absent, le backend utilise `mistral`.
   - Si aucune clé n'est configurée, le backend reste en mode mock.

## Pull requests

### Fermée

- PR #14 — `Rescue: fix Octopus install allowlist and auto-enable Mistral`
  - Fermée car ses changements ont été repris directement sur `main`.

### Conservée ouverte

- PR #1 — `Sprint 2 lite — Generic knowledge engine foundation`
  - Gardée en draft.
  - Ne pas merger avant le pivot Observatory.
  - Elle contient des briques Knowledge utiles mais risque de créer une deuxième architecture si elle est fusionnée trop tôt.

## Pivot Observatory

Le pivot annoncé par Codex n'est pas présent sur `main` au moment de ce triage.

Fichiers attendus mais absents de `main` :

- `artifacts/blacklace-publisher/src/pages/observatory.tsx`
- `artifacts/blacklace-publisher/src/models/knowledge-observatory.ts`
- `artifacts/blacklace-publisher/src/connectors/source-connectors.ts`
- `artifacts/blacklace-publisher/src/observation/observe-source.ts`
- `artifacts/blacklace-publisher/src/extractors/extract-knowledge.ts`
- `artifacts/blacklace-publisher/src/knowledge/build-knowledge-pack.ts`
- `artifacts/blacklace-publisher/src/export/octopus-export.ts`
- `artifacts/blacklace-publisher/src/services/knowledge-observatory.ts`

Fichiers attendus comme modifies mais sans changement Observatory sur `main` :

- `artifacts/blacklace-publisher/src/App.tsx`
- `artifacts/blacklace-publisher/src/components/layout/sidebar.tsx`
- `artifacts/blacklace-publisher/src/pages/dashboard.tsx`

## Prochaine action simple

Quand Codex redevient disponible :

```md
Tu as implémenté le pivot Observatory mais il n'est pas visible sur GitHub ni sur Render.

Fais maintenant uniquement ceci :

1. Vérifie les fichiers modifiés/créés.
2. Commit tous les fichiers Observatory listés.
3. Push sur GitHub, branche `feature/knowledge-observatory-pivot`.
4. Ouvre une PR vers `main`.

Ne modifie rien d'autre.
Ne recode rien.
Ne refais pas le pivot.
Pousse simplement le travail déjà fait.
```

## Règle de sécurité

Ne pas fusionner de nouvelle couche Knowledge tant que la route `/observatory` et le flux Source -> Observation -> Extraction -> Knowledge -> Knowledge Pack ne sont pas visibles dans la PR Observatory.
