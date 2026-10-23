# Audit des transports Buffer et Metricool — 22 octobre 2026

Gérard décide du projet, du texte, du média et de la destination. Publisher contrôle les capacités puis exécute le transport demandé. Octopus orchestre la mission `social.publish` existante. Aucun nouvel agent, ordonnanceur, stockage ou transport de remplacement.

Cette extension s'appuie sur Publisher [#138](https://github.com/benoitlub/blacklace-publisher-ai/pull/138) puis [#140](https://github.com/benoitlub/blacklace-publisher-ai/pull/140), et Poulpe [#109](https://github.com/benoitlub/poulpe-fiction/pull/109) puis [#110](https://github.com/benoitlub/poulpe-fiction/pull/110). #138 et #109 ont été relues : ouvertes, brouillons, fusionnables, non fusionnées ; leurs validations antérieures étaient réussies. Les exclusions par seed restent couvertes par les suites complètes.

## Capacités et limites vérifiées

« Simulation » signifie code réel Publisher/Octopus/client Gérard, fournisseurs et SQL simulés, tout appel réseau imprévu interdit. Ce n'est pas une preuve de fonctionnement du compte de production.

| Capacité | Buffer | Metricool |
| --- | --- | --- |
| Connexion actuelle de production | Non vérifiable : diagnostic Worker HTTP 403 / `1010` ; aucune connexion Buffer active dans le connecteur de cette session | Non vérifiable : diagnostic Worker HTTP 403 / `1010` ; aucun accès aux identifiants du projet Composio du Worker |
| Compte/canal identifié historiquement | Instagram `benoitlubert`, canal `6ac8c8226a5c39ccb65fdbf6`, confirmé par logs du 14/10 ; état actuel inconnu | Marque configurée `3350145`, `pro.hbtd`, Europe/Madrid ; compte Composio actif et schémas réels encore à vérifier |
| Découverte et capacités | Simulation des organisations, indicateurs déconnecté/verrouillé/file suspendue ; réponse `partial` au-delà de la borne | Simulation pagination des comptes/outils, alias MCP, propriétaire, ambiguïté et erreurs distinctes (#140) |
| Brouillon | Création simulée, ID persisté puis lecture directe : texte exact, canal exact, média image ; ID seul insuffisant | Le circuit autonome programme après validation ; la préparation reste sans écriture |
| Mise en file / programmation | Simulation : création **brouillon**, lecture, `editPost` du **même ID**, image et texte renvoyés, lecture d'un statut `scheduled` avec date future | Simulation : quota complet, meilleurs horaires, réservation CAS, relecture avant écriture, programmation, confirmation par ID (#140) |
| Réseaux couverts par ce correctif | Un canal Instagram existant, livre avec couverture officielle JPEG/PNG/WebP ; autres canaux seulement découverts, pas déclarés exécutables | Moteur : Facebook/Instagram/YouTube selon schémas et médias ; E2E prouvé : Facebook texte et Facebook + Instagram image ; client Gérard actuel limité à ces deux réseaux |
| Quota mensuel | Aucun compteur mensuel Buffer vérifié ; limites du plan non connues. Erreur API/429 bloque, sans fallback | Simulation du comptage publié + programmé + réservations par réseau, tous formats connectés, plafond existant de 20 unités/mois/marque. Consommation et limites commerciales actuelles **non vérifiées** |
| Antidoublon | Empreinte canal/texte/image indépendante du mode brouillon/file et du harvest ; anciennes réservations du harvest conservées ; CAS avant création/édition ; réponse incertaine sans recréation automatique | Simulation doublon de contenu, opération stable, concurrence, dernier quota disponible, quota modifié avant écriture, réponse incertaine conservée (#140) |
| Lecture de statut | Rejouer le même paquet avec `dryRun:true` relit directement le post connu, sans mutation ; `sent` et `scheduled` distincts, brouillon/erreur non présentés comme programmés | Même opération relit l'ID connu sans nouvelle programmation ; confirmation contenu/médias/réseaux/date (#140) |
| Octopus | E2E réel avec API Publisher et Worker, fournisseur simulé ; client Buffer opt-in, cron inchangé | Deux E2E réels avec fournisseur simulé ; moteur Octopus existant inchangé |

## Brouillons précédemment introuvables : preuves

- [Run 38619406815](https://github.com/benoitlub/poulpe-fiction/actions/runs/38619406815), 14/10 à 18:57:18 UTC : Buffer répond `InvalidInputError`, « Instagram posts require a type (post, story, or reel) ». Aucun ID créé dans cette réponse. Le workflow était vert mais le transport avait échoué.
- [Run 38646496703](https://github.com/benoitlub/poulpe-fiction/actions/runs/38646496703), 22:17:56 UTC : lecture exhaustive de 51 posts, brouillon `6acfd4de0b61877d1315e86b` retrouvé par correspondance du texte, créé à 19:15:42 UTC. Canal Instagram disponible **à cette date**. Il ne faut donc pas conclure que tous les brouillons avaient disparu.
- Même run à 22:17:59 UTC : promotion rejetée, « Instagram posts require at least one image or video ». Le correctif existant renvoie déjà la couverture lors de l'édition ; cette extension ajoute la relecture après édition et ne revendique aucune programmation historique ou actuelle sans preuve fraîche.
- Une page de résultats manquante ne constitue jamais une preuve d'absence. Le lookup parcourt désormais les curseurs (borne 30 pages), signale curseur absent/bouclé, erreur HTTP ou réponse partielle, et conserve les réservations incertaines.

## Avant / après

| Avant | Après proposé |
| --- | --- |
| `createPost` + ID suffisait à annoncer un brouillon ou une file | ID persisté avant confirmation ; lecture directe obligatoire ; brouillon puis édition en place puis relecture de la date |
| L'empreinte contenait `publish` et `harvestId` | Même empreinte canal/texte/média pour brouillon → file et contenu identique venant d'une autre récolte ; lecture des anciennes lignes conservée |
| Un choix explicite Metricool indisponible pouvait basculer vers Buffer | Choix conservé et suspendu ; aucun remplacement automatique d'une destination explicite |
| Diagnostic sans appel fournisseur déclarait Metricool « existing-production » | Connexion et quota indiqués non vérifiés ; présence d'un secret distincte d'une connexion fonctionnelle |
| Autre marque ou fuseau Metricool fourni par l'appelant ignoré | Rejet explicite avant dépendances, aucune substitution de marque |
| Copie Buffer trop longue tronquée silencieusement | Rejet avant écriture ; texte et image de Gérard conservés dans le circuit général |
| Réponse incertaine lors d'une édition | Réservation conservée ; lecture ultérieure par ID, statut durable réconcilié si confirmé, aucune seconde édition |

Le parcours historique de récupération du seul brouillon Gérard est conservé, avec sa portée et sa légende historique explicites. Le nouveau parcours général utilise le texte transmis par Gérard. Les deux circuits Buffer et Metricool restent en place. Ils partagent la validation et l'orchestration, mais leurs comptes, API, réservations et règles de quota diffèrent ; aucune équivalence fonctionnelle ou suppression n'est proposée. Il n'existe pas de dédoublonnage global des publications faites manuellement hors Publisher ou entre les deux fournisseurs.

## Tests réellement exécutés

Node 24.19.0, pnpm 10.32.1. Toutes les mutations des transports/SQL sont simulées.

- Worker : `npm test` — **104 réussis, 0 échec, 1 ignoré** ; `npm run typecheck` réussi. Ignoré : intégration Postgres Observatoire sans `TEST_DATABASE_URL`.
- API : `pnpm --filter @workspace/api-server test` — **67 tests / 18 fichiers réussis**.
- Interface : `pnpm --filter @workspace/blacklace-publisher test` — **12 tests / 2 fichiers réussis**.
- Poulpe : `npm test` — **94 réussis** ; `npm run build` réussi ; aucun changement de workflow/cron.
- `GERARD_CLIENT_PATH=/workspace/poulpe-fiction/scripts/gerard-metricool-publication.mjs pnpm --filter @workspace/scripts exec tsx --test ./gerard-metricool-e2e.test.mts ./gerard-buffer-e2e.test.mts` — **3 scénarios réussis**, vrai client des deux transports.
- Même commande sans `GERARD_CLIENT_PATH` — **3 scénarios réussis**, missions versionnées utilisées par la CI.
- `BASE_PATH=/ PORT=5173 DB_PUSH=0 pnpm run build` — types et build Publisher réussis, avertissements préexistants de sourcemaps/taille des chunks ; aucune synchronisation de schéma.
- `git diff --check` réussi. Suite CI PR étendue aux trois simulations, sans secrets et sans déclenchement opérationnel.

Preuve machine : [traces des trois parcours](2026-10-22-social-transports-simulation.json). Buffer : `buffer-simulated-42`, une création et une édition simulées, lectures `draft` puis `scheduled`, répétition sans écriture. Metricool : un post simulé par scénario, douze lectures de consommation avant écriture, répétition sans écriture. Ces IDs sont **exclusivement des fixtures**, jamais des publications réelles.

Les premiers essais des tests dans le bac à sable ont rencontré un refus de socket IPC de `tsx` ; un essai Poulpe a été interrompu. Les comptes ci-dessus proviennent des commandes complètes relancées avec accès aux processus locaux, pas de ces essais interrompus.

## Interventions humaines restantes

1. Revoir et décider des PR dépendantes, sans fusion automatique. Aucun changement de cette extension n'est déployé.
2. Depuis un environnement autorisé à joindre le Worker (ici HTTP 403), lire les comptes/canaux réels. Pour Buffer : confirmer ID, organisation, Instagram, droits, verrouillage et file non suspendue ; relire le brouillon historique par son ID. Ne pas recréer un post à partir d'une absence dans la liste.
3. Dans **le projet Composio du Worker**, rétablir/choisir le compte Metricool actif, vérifier le bon utilisateur, la marque `3350145`, ses réseaux, les schémas MCP et les relevés complets du mois ; contrôler le plafond du plan si différent de la politique existante. Aucune nouvelle connexion ou limite n'a été créée ici.
4. Après revue et uniquement sur décision humaine : rendre les correctifs disponibles et configurer les autorisations d'exécution côté serveur. Le nouveau Buffer par Octopus utilise le secret **existant** `BUFFER_DRAFT_WRITE_TOKEN` côté API et Worker, et exige `BUFFER_PUBLISHING_ENABLED=true` pour programmer. Rien n'a été activé, aucun secret modifié. Les exigences Metricool de #140 restent inchangées.
5. Le client `submitBufferPublication` est opt-in et n'est pas branché au cron : fournir le `transport.channelId` choisi et le réseau Instagram explicite. Tester d'abord avec le même paquet en `dryRun:true` ; toute activation réelle et tout changement du cron restent hors de cette mission.

Aucune publication, dépense, génération payante, modification de budget/secret, connexion de compte, migration de données, modification d'Octopus Engine, déploiement ou fusion effectuée.
