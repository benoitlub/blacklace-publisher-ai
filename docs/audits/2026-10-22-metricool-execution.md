# Gérard → Octopus → Publisher → Composio → Metricool

Audit et correctifs du 22 octobre 2026. Aucun déploiement, fusion, changement de
secret/variable distant, dépense, programmation ou publication réelle effectué.
Aucun nouvel agent et aucune modification d'octopus-engine.

## État initial et diagnostic établi

- [Publisher #138](https://github.com/benoitlub/blacklace-publisher-ai/pull/138), SHA `296c0a822292d135d4cacaa8d16268a62bf44412` : ouverte, brouillon, CI et tests Worker verts. La sélection par seed est conservée.
- [Poulpe #109](https://github.com/benoitlub/poulpe-fiction/pull/109), SHA `a6a3b3817ff9d8a8eef6d420bb42aba9def12a05` : ouverte, brouillon, build/tests verts. Le REST GitHub brut confirme `mergeable=true`, `mergeable_state=clean`, après une première réponse normalisée contradictoire. La comparaison locale avec main ne trouve pas de conflit.
- Le [runtime Gérard 39859374167](https://github.com/benoitlub/poulpe-fiction/actions/runs/39859374167), job `120105800147`, termine « success » tout en enregistrant à `2026-10-22T21:43:07Z` : `Metricool quota unavailable: no active Metricool account.`, HTTP 503, `scheduled=false`. Un workflow vert ne prouve donc pas une publication.
- La découverte Composio s'arrêtait au premier compte trouvé, même Canva, ignorait les pages suivantes et ne reconnaissait pas les alias MCP Metricool. Le repli sans filtre utilisateur risquait aussi de sélectionner une connexion d'un autre utilisateur.
- Le lecteur de quota ne faisait aucun appel de consommation : il retournait toujours `unresolved`. Le finaliseur était ensuite un bouchon « best-time-and-deduplication » ; le Worker n'exécutait pas `social.publish`, et l'adaptateur Express local ne déclarait même pas cette capacité.
- Gérard appelait directement le finaliseur Worker, sans mission Octopus pour cette étape.

La lecture directe de `/api/production/metricool-tools` depuis cet environnement
est refusée : HTTP 403, `error code: 1010`. La recherche dans le catalogue Composio
de la session n'a pas retourné d'outil Metricool. Ces observations ne prouvent
pas l'absence d'une connexion dans le projet Composio du Worker. L'état réel du
compte, son entitlement API et sa consommation mensuelle ne sont **pas certifiés**.
Aucun nouveau compte ni nouvelle connexion n'a été créé.

## Correctifs et limites de leur portée

1. Découverte paginée et limitée à l'utilisateur Composio configuré ; statut nettoyé, alias `metricool`, `metricool_mcp`, `mcp-metricool`. Repli singulier seulement après HTTP 400/404/422. Un 401, 429, 5xx, résultat partiel ou boucle de pagination n'est jamais transformé en liste vide. Plusieurs comptes actifs demandent un choix explicite via `METRICOOL_CONNECTED_ACCOUNT_ID`. Les diagnostics distinguent compte absent, expiré, mauvais ID et ambiguïté.
2. Adaptation des opérations MCP documentées : marques, historique publié, calendrier, meilleurs horaires et programmation. Les slugs sont pris dans le registre découvert, jamais inventés à l'exécution. Schéma absent/incompatible ou réponse inconnue : blocage. L'ID du compte et l'utilisateur Composio sont passés explicitement ; les appels Metricool sont bornés et ne réessaient pas une écriture.
3. Plafond conservé à **20 unités par mois civil et marque**, une unité par réseau. Lecture des posts/reels/stories de tous les réseaux connectés supportés, puis des programmations ; ajout des réservations locales non encore visibles par réseau. Les réseaux de marque non couverts, pages incomplètes ou compteurs inconnus bloquent. Les données manuelles du Garden et les compteurs du client ne peuvent pas autoriser la programmation.
4. Mois et créneaux dans le fuseau confirmé de la marque (`3350145`, `pro.hbtd`, `Europe/Madrid`). Le créneau vient des heatmaps Metricool, couvre les réseaux demandés, reste dans le mois vérifié et respecte quatre heures d'espacement. Pas de date inventée à +24h ; heures ambiguës/inexistantes des changements d'heure refusées. Une dernière lecture du quota/calendrier a lieu après réservation, juste avant l'écriture.
5. Réutilisation de la table existante `publisher_global_state`, namespace `metricool-publications`, clé de marque. Un CAS sur `version` réserve la demande avant l'appel externe et sérialise les Workers concurrents. Aucun nouveau stockage, table ou migration. Une annulation avant tout appel de programmation peut retirer uniquement sa propre réservation par CAS. Après appel, erreur/timeout ou réponse incertaine conserve la réservation : pas de réécriture automatique, pas d'expiration aveugle.
6. Détection des copies identiques publiées/programmées dans l'historique du mois et des demandes déjà connues localement. Un même identifiant d'opération avec un autre contenu est refusé. La reprise de la même demande lit le fournisseur et réconcilie l'ID existant ; elle ne recrée pas un post. Les écritures manuelles hors Publisher restent hors de son verrou : l'API fournisseur n'expose ici aucune réservation atomique distante. La dernière relecture réduit cette fenêtre sans prétendre l'éliminer.
7. Source et routage vérifiés côté serveur. Livres conservés sur Buffer ; pas de repli sur le compte jeux. Médias limités à la récolte source, HTTPS public sans identifiants, contrôle HEAD sans redirection, type image/vidéo compatible. Aucun appel de génération, téléchargement ou achat de média. Un média manquant pour Instagram/YouTube bloque ; Facebook texte reste possible si Gérard l'a demandé.
8. Succès uniquement après lecture fournisseur correspondant à l'ID, au texte, aux médias, aux réseaux et au créneau. L'ID retourné par un POST, l'acceptation d'une mission ou un HTTP 200 ne suffisent pas. Les statuts `scheduled`, `published`, erreur partielle et résultat inconnu restent distincts. Les lectures de statut d'une opération existante n'exigent pas que sa récolte soit encore dans le Garden.

Le compteur est conservateur : si les identifiants des historiques analytique et
calendrier ne permettent pas de réunir deux observations, elles peuvent être
comptées deux fois et bloquer plus tôt. Il s'agit du plafond éditorial existant,
pas d'une affirmation sur le tarif ou le compteur contractuel de l'abonnement.
Les comptes, formats de réponse ou transformations de médias non reconnus
restent bloqués jusqu'à vérification humaine du contrat réel.

Le contrat public consulté est [mcp-metricool/tools.py](https://github.com/tylergermain/mcp-metricool/blob/master/src/mcp_metricool/tools/tools.py),
blob `bd59af14ff3c0689edf3eacc609dee45182632bd` : signatures `get_brands`,
`get_scheduled_posts`, `get_best_time_to_post`, `post_schedule_post` et lecteurs
analytiques par réseau. Les noms `METRICOOL_MCP_*` des fixtures sont **simulés** ;
ils ne sont pas présentés comme les outils réellement installés chez l'utilisateur.

## Parcours et activation

Gérard garde le contenu, la récolte et les réseaux. Le client Poulpe construit
une mission `social.publish` pour le `/mission` existant d'Octopus, avec une clé
de publication stable et une trace de mission distincte. Octopus sélectionne
l'adaptateur Publisher déjà enregistré. L'adaptateur local transmet au Worker
avec un bearer gardé côté serveur, jamais dans la mission, l'URL ou ses journaux.
Sa route Express sociale est limitée au loopback sans en-tête de proxy.

Deux garde-fous indépendants restent désactivés par défaut :

- Worker : `METRICOOL_PUBLISHING_ENABLED=true`, plus bearer correspondant à `METRICOOL_EXECUTION_TOKEN` pour une écriture.
- Gérard : variable Actions `GERARD_METRICOOL_EXECUTION_ENABLED=true` pour envoyer `dryRun=false`. Sinon, lecture/préparation uniquement.

Les références à ces valeurs ont été ajoutées au code/workflow ; **aucune valeur
distante n'a été lue, créée ou changée**. Les secrets des tests sont fictifs.
Les horaires, événements déclencheurs, concurrence et toutes les autres étapes
du cycle sont identiques à #109. Le cron déployé et ses exécutions n'ont été ni
arrêtés, relancés ni modifiés. Les générations autonomes préexistantes restent hors
de ce correctif.

## Tests réellement exécutés

Node 24.19.0, pnpm 10.32.1. Dépendances déjà installées lors de l'audit précédent ;
aucun changement de dépendance ou de verrou n'est livré.

| Vérification locale | Résultat |
| --- | --- |
| Worker `npm test` | 90 réussis, 0 échec, 1 ignoré (`TEST_DATABASE_URL` absent) |
| Worker `npm run typecheck` | réussi |
| API `pnpm --filter @workspace/api-server test` | 18 fichiers, 66 tests réussis |
| Interface `pnpm --filter @workspace/blacklace-publisher test` | 12 tests réussis |
| `BASE_PATH=/ PORT=5173 DB_PUSH=0 pnpm run build` | typechecks et build réussis, aucun push de schéma |
| Poulpe `npm test` | 93 tests réussis |
| Poulpe `npm run build` | réussi ; fichier généré exclu des correctifs |
| Parcours complet avec le vrai client Poulpe et Octopus installé | 2 scénarios réussis |
| Même parcours avec la mission versionnée pour CI | 2 scénarios réussis |
| YAML + `bash -n` | 37 blocs Gérard et 3 blocs du nouveau workflow de simulation valides |
| Diff | `git diff --check` réussi dans les deux dépôts |

Commande de preuve inter-dépôts, dans Publisher :

```sh
GERARD_CLIENT_PATH=/workspace/poulpe-fiction/scripts/gerard-metricool-publication.mjs \
  pnpm --filter @workspace/scripts exec tsx --test ./gerard-metricool-e2e.test.mts
```

Sans `GERARD_CLIENT_PATH`, la CI utilise la mission produite par ce même client et
versionnée dans les fixtures. Le moteur testé est celui déjà épinglé par
Publisher : Octopus `3d0c36d5a6228e23a20191b893bdb349d0875c4a`.
La [preuve JSON](2026-10-22-metricool-simulation.json) trace les deux parcours :
Facebook texte et Facebook + Instagram avec image. Chacun effectue une seule
programmation **simulée**, confirme son ID, puis répète la demande sans nouvelle
écriture. Les six lecteurs de quota sont vérifiés avant et juste avant l'écriture.
Toutes les requêtes réseau non prévues font échouer le test. Neon, Composio,
Metricool et HEAD média sont remplacés aux frontières ; les adaptateurs et le
moteur sont réels. Aucun test contre Postgres/Neon ou fournisseur réel.

Les autres cas couvrent quota épuisé/inconnu, réservations concurrentes et dernière
unité, changement de consommation avant écriture, boucles/pages partielles,
comptes expirés/ambigus/étrangers, 401/403/429, médias invalides, erreur partielle
réseau social, timeout après écriture, ID seul sans confirmation, reprise sans
doublon, changement de requête sous la même clé et suivi publié/programmé.

## Interventions humaines restantes

1. Revoir et fusionner manuellement #138/#109 puis les PR dépendantes de cette mission ; publier les versions approuvées dans un chantier distinct. Les PR nouvelles ciblent leurs branches pour isoler les changements. Rien n'est déployé ici.
2. Depuis un accès autorisé au diagnostic (403 dans cet environnement), vérifier la connexion **dans le même projet Composio et pour le même `COMPOSIO_USER_ID` que le Worker**. Une connexion ChatGPT/Metricool n'est pas automatiquement une connexion du runtime. Reconnecter seulement si nécessaire ; choisir l'ID explicite s'il y en a plusieurs.
3. Confirmer marque, compte social, fuseau et accès API déjà disponible. Vérifier les schémas et réponses réels des lecteurs de tous les formats, meilleurs horaires et programmation. Si l'accès exige une offre payante ou un contrat non supporté, garder le parcours bloqué : aucun achat/upgrade n'est effectué.
4. Vérifier que la table existante `publisher_global_state` est disponible avec les droits de lecture/écriture et que les données de quota sont complètes. Le test SQL réel demeure à exécuter sur une base dédiée. Confirmer aussi l'articulation du plafond éditorial de 20 unités avec les programmations manuelles et les limites natives du fournisseur.
5. Provisionner par le gestionnaire de secrets le même token d'exécution dans le Worker et le runtime Actions, sans le coller dans un ticket, une mission ou une URL. Laisser les deux flags désactivés ; effectuer d'abord une préparation `dryRun=true` en lecture seule avec les identités réelles.
6. Une fois la recette réelle et la revue terminées, décider explicitement de l'activation des deux flags. Toute première programmation réelle et son observation sont hors de cette mission. En cas de résultat incertain, inspecter le post et la réservation existants ; ne pas forcer une nouvelle opération ni effacer la réservation sans preuve fournisseur.
