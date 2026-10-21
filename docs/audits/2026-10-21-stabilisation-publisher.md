# Audit de fin de chantier — 21 octobre 2026

Périmètre : Publisher PR [#138](https://github.com/benoitlub/blacklace-publisher-ai/pull/138)
et Poulpe Fiction PR [#109](https://github.com/benoitlub/poulpe-fiction/pull/109).
Bases examinées : Publisher `f5d2f934bf6e373548fda7fc2e3a3ab913737256`
(main `03f2abb7cc432c2028d468830fd954f5288584a8`),
Poulpe `64e78e6f6c6b7179b4e12ab63fa50b61d2ac6e83`.

## Avant / après

| Vérification | Avant | Après, exécution locale |
| --- | --- | --- |
| TypeScript Worker | 29 diagnostics : union avec `{}`, propriété `mission` dupliquée, valeurs nullables | 0 erreur, `npm run typecheck` |
| CI API | 16 fichiers passent, 1 échoue à l'import de la base ; 59 tests exécutés | 17 fichiers, 63 tests passent |
| Tests interface | Étape sautée après l'échec API | 2 fichiers, 12 tests passent |
| Suite Worker complète | 44 passent, 2 échouent, 1 ignoré | 57 passent, 0 échec, 1 ignoré |
| Exclusion Publisher | 4 tests du prédicat, déjà verts dans #138 | 12 tests : prédicat + véritable handler HTTP avec transport SQL simulé |
| Décisions d'exploration Gérard | Les seeds autres que 420 sont exclus seulement via les IDs locaux connus | Le seed décidé est transmis au premier appel et aux alternatives, même sans inventaire local |
| Régression Poulpe | Nouveaux tests exécutés contre le workflow initial : 4 passent, 3 échouent | 7 nouveaux tests passent ; suite entière : 87/87 |
| Builds | Build Publisher déjà vert dans la CI examinée | Builds locaux Publisher et Poulpe réussis |

## Échecs Actions examinés

Lecture des 30 exécutions les plus récentes disponibles au début de l'audit.
Les journaux suivants établissent les causes, sans relancer les workflows opérationnels :

- [CI #138, run 39682365136](https://github.com/benoitlub/blacklace-publisher-ai/actions/runs/39682365136) : typecheck racine et build réussis ; échec de `knowledge-package-resolver.test.ts` parce que l'import de `knowledge-digestion` initialise indirectement `@workspace/db` sans `DATABASE_URL`.
- [Worker #138, run 39682365436](https://github.com/benoitlub/blacklace-publisher-ai/actions/runs/39682365436) : 4/4 tests seed réussis, puis 29 diagnostics TypeScript. Node 20 produit aussi des avertissements de compatibilité avec les dépendances Worker récentes.
- Même erreur d'import de base confirmée sur [main, 39106029961](https://github.com/benoitlub/blacklace-publisher-ai/actions/runs/39106029961), [creative packs, 39146018223](https://github.com/benoitlub/blacklace-publisher-ai/actions/runs/39146018223) et [Windsor, 39338539558](https://github.com/benoitlub/blacklace-publisher-ai/actions/runs/39338539558). Elle préexiste à #138.

## Corrections

- Typage explicite des valeurs de repli JSON, protection de deux valeurs nullables ; suppression de la première clé `mission` déjà écrasée à l'exécution. Le contrat retourné conserve sa mission de découverte existante. Aucun `any`, désactivation de contrôle ou changement de strictness ajouté.
- Le test unitaire de classification des sources simule uniquement `knowledge-digestion`. La fonction de classification reste réelle ; aucune URL de base fictive n'est injectée dans la CI et aucun comportement de production de la base n'est changé.
- Tests Canva : un conteneur avec lien d'édition seul est refusé ; un export image est accepté avec son véritable ID. Tests Notion : le diagnostic workspace reste prioritaire sur un ancien ID, conformément au changement existant `ba4071f`. Les comportements de production correspondants ne sont pas assouplis.
- La CI Worker couvre désormais tout `publisher-worker/**`, exécute la suite complète, utilise Node 24 et `npm ci` avec le verrou existant.
- Poulpe transmet les seeds des décisions existantes « trois répétitions » et `chosenExperiment=explore`, en plus du repos 420. Les IDs historiques restent compatibles. Aucun nouveau décideur, politique éditoriale ou service n'est introduit.
- Le workflow opérationnel Gérard ne réagit plus aux push des branches de PR : `push.branches: [main]`. Schedule, déclenchement manuel et cycle sur main sont conservés. La validation de PR ajoute `npm test` à son build.

## Gérard décide ; Publisher fournit ; Octopus exécute

Conformité vérifiée sur le parcours de sélection et l'adaptateur :

- Les exclusions seed et récolte s'appliquent avant classement ; un nouveau harvestId du même seed reste exclu.
- Un `harvestId` explicitement choisi par Gérard prévaut sur le classement s'il est éligible. S'il est inconnu ou exclu, Publisher retourne `404 / empty`, sans substituer un autre candidat.
- Les exclusions privées Yaël, les contenus internes et les règles d'éligibilité restent actives.
- Les packages testés restent des brouillons (`autoPublish=false`) ; les médias utilisés sont existants. Toute requête réseau autre que le faux transport SQL fait échouer le test.
- L'adaptateur `social.publish` exige l'autorisation explicite et reste non exécutable tant que son exécuteur n'est pas actif. Les deux situations sont testées sans fournisseur réel.
- Les tests Poulpe exécutent le bloc shell réel du workflow dans un répertoire temporaire. Un faux `curl` ne connaît que la sélection et le routage ; aucune programmation n'est possible dans ce test.

Cette vérification ne constitue pas une certification globale de séparation des rôles :
le Worker conserve un cron `scheduled()` → `runTentacleCycle()` qui choisit son mode,
et `/api/social/bridge/next` peut produire une image si aucun média n'est disponible.
Ces chemins autonomes préexistants n'ont été ni exécutés ni modifiés. Leur éventuelle
révision relève d'une décision distincte de Gérard ; aucune nouvelle architecture
n'est proposée ici.

## Commandes réellement exécutées

Environnement local : Node `v24.19.0`, pnpm `10.32.1` (version du dépôt), npm `11.9.0`.

```sh
# Publisher racine : installation et mêmes validations que CI
npx --yes pnpm@10.32.1 install --no-frozen-lockfile
npx --yes pnpm@10.32.1 --filter @workspace/api-server test
npx --yes pnpm@10.32.1 --filter @workspace/blacklace-publisher test
BASE_PATH=/ PORT=5173 DB_PUSH=0 npx --yes pnpm@10.32.1 run build
# build inclut le typecheck des bibliothèques, de l'API et de l'interface

# publisher-worker
npm ci --no-audit --no-fund
npm run typecheck
npm test

# Poulpe Fiction
npm install --no-audit --no-fund
npm run build
npm test
```

Également exécutés : `git diff --check` dans les deux dépôts ; lecture YAML des
workflows modifiés ; `bash -n` sur les 37 blocs shell de Gérard et les 3 blocs de
validation Poulpe, avec expressions GitHub remplacées par des valeurs inertes.
La suite Worker initiale a été rejouée sur une archive du SHA original, avec les
mêmes dépendances. Les nouveaux tests Poulpe ont aussi été exécutés sur le workflow
initial pour confirmer leurs trois échecs, puis sur la correction.

Le premier install local a utilisé le pnpm de l'environnement, incompatible avec
la préparation du paquet Git Octopus ; il a été remplacé par pnpm 10.32.1, sans
changer les dépendances du dépôt. Le sandbox interdit le socket IPC de tsx : les
résultats retenus proviennent des commandes locales autorisées hors de cette
restriction. Les erreurs de mise au point des doubles HTTP ont été corrigées
avant les résultats finaux ci-dessus.

## Limites et actions non réalisées

- Le test de persistance Observatoire reste ignoré : `TEST_DATABASE_URL` absent. Aucun test contre Neon/Postgres réel n'a été effectué.
- Pas de cycle réel Gérard, d'appel Mistral/Metricool/Buffer/Canva, de publication ou de programmation. Le HTTP 503 Composio/Metricool mentionné dans les PR n'est ni reproduit ni déclaré corrigé.
- Les builds gardent leurs avertissements non bloquants : sourcemaps/chunk volumineux côté Publisher, scripts classiques copiés après Vite côté Poulpe ; avertissement peer dependency esbuild/pino à l'installation Publisher.
- Aucun déploiement Cloudflare ou Pages, aucun changement de secrets, de budgets, de schéma ou d'architecture, aucune fusion ni activation d'auto-merge. Les fichiers générés et changements de verrou d'installation Poulpe sont exclus des corrections.
- Ces résultats locaux ne préjugent pas de l'état des nouvelles exécutions GitHub Actions : leur résultat doit être consulté sur les PR mises à jour. L'ancien Publisher déployé ne comprend pas encore le nouveau filtre ; l'effet en production n'est pas revendiqué.
