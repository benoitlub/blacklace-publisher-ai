# Issue Poulpe Fiction #114 — circuit Gérard / Publisher / Composio

Référence : https://github.com/benoitlub/poulpe-fiction/issues/114. Versions examinées : Publisher `c022cec916a85391fcdc90f002f52f35ee6b20d2`, Poulpe `95c4ba50f66712a27df2b0eda8895988e2a1ebbb`, Octopus `a46822958afd017bf30cb07ef156781cc789d4d7`.

## Circuit réel et rupture corrigée

```mermaid
flowchart LR
  G["Gérard : besoin métier / cultivate"] --> O["Octopus existant : /mission"]
  O --> A["Publisher Express local : /api/octopus-adapter/execute"]
  A --> W["Publisher Worker : même contrat d'adaptateur"]
  W --> D["Composio : inventaire, schémas, connexions de cet utilisateur"]
  D --> V["Sélection + validation + autorisation + réservation"]
  V --> R["Une lecture gérée autorisée, sans retry automatique"]
  R --> G
```

Le runtime `.github/workflows/gerard-runtime.yml` installe Octopus et Publisher, démarre leurs serveurs locaux puis enregistre une liste statique de capacités vers l'API Express. `scripts/gerard-cycle.mjs` demande `business.sources.search`. Cette capacité avait été ajoutée au **Worker seulement**, sans implémentation Express et sans déclaration dans l'enregistrement du runtime. Les diagnostics du Worker et le vrai point d'entrée du cycle décrivaient donc deux surfaces différentes.

Autres défauts :

- Un HTTP 200 d'Octopus était réduit à `ok` ; sa raison réelle se perdait avant `harvest-failed`.
- L'appel B2B exécutait directement `COMPOSIO_SEARCH_WEB` sans valider l'inventaire, le schéma et le choix de connexion ; les citations utilisant `id` comme URL étaient ignorées.
- Une recherche externe dépendait d'une fiche Notion interne, puis supprimait une section par marqueur textuel pour éviter une ancienne offre freelance. Le sourcing ne doit pas dépendre de cette fiche ni d'un appel Mistral.
- Le catalogue confondait correspondance de texte + connexion active avec exécution disponible. L'ancien client Composio d'Express pouvait aussi élargir une liste vide aux connexions de tout le projet.

**Preuves historiques** : [cultivate 40091774609](https://github.com/benoitlub/poulpe-fiction/actions/runs/40091774609), 24/10, 11:57 UTC : zéro source, statut intermédiaire `ok`, puis `harvest-failed / b2b-external-sources-unavailable`. Le [run vert 40109686686](https://github.com/benoitlub/poulpe-fiction/actions/runs/40109686686), 16:03 UTC, exécutait `symbiosis / delivery-backlog-priority`, pas une recherche B2B. Il ne constitue pas une réussite commerciale. Le statut intermédiaire exact a été perdu dans les anciens logs ; la rupture d'enregistrement est établie par le code et reproduite par les tests.

## Composants conservés

| Composant | Rôle / état |
| --- | --- |
| `benoitlub/poulpe-fiction` | Intention, sélection du seed, cycle Node, stockage local des récoltes et apprentissage |
| `benoitlub/blacklace-publisher-ai` — API Express | Adaptateur local appelé dans Actions ; relaye désormais découverte et recherche au Worker détenteur des identifiants |
| Worker `blacklace-publisher-worker.benoitlubert.workers.dev` | Composio, schémas, connexions, politique de lecture et résultat normalisé ; service binding Octopus existant conservé |
| Worker `octopus-engine-app.benoitlubert.workers.dev` et Octopus local | Contrat neutre de mission et adaptateurs ; moteur actuel compilé/testé, **aucune source Octopus modifiée** |
| Neon / `publisher_global_state` | Table existante utilisée pour l'idempotence et la trace de lecture ; aucune migration ni nouvelle infrastructure |
| Mistral, Notion, métriques sociales | Circuits existants conservés. Aucun appel de génération ou de publication réel pour les tests B2B |
| `benoitlub/metaverse-creator` | Autre consommateur existant du contrat Publisher (`content.generate`), cité par l'adaptateur ; pas une dépendance de `cultivate` B2B, aucun changement |

Les chemins Observatoire, clients Composio Worker/Express et adaptateurs sociaux ne sont pas supprimés. La nouvelle exécution métier a un seul décideur technique côté Worker ; Express ne reconstitue pas un second sélectionneur. Son ancien client conserve les intégrations existantes mais corrige la pagination/scoping des comptes. Les capacités de publication passent toujours par leurs finaliseurs avec quotas, tokens et confirmation de statut ; la recherche ne les appelle jamais.

## Capacités et garde-fous

| Capacité / état | Résultat prouvé | Limite |
| --- | --- | --- |
| `tool.search` | Inventaire dynamique, métadonnées, schémas, connexions et règles de sélection ; pas d'exécution | Un candidat découvert/actif reste `executionVerified:false`. Les requêtes métier courantes sont traduites en recherche de catalogue sans modèle IA |
| `business.sources.search` | Découverte paginée, schéma chargé par le slug réellement reçu, paramètres validés, retour normalisé | Sources candidates uniquement ; jamais des contacts qualifiés ou une vente |
| `tool.execute` | Même lecture métier contrôlée, sans connaître le slug à l'avance | Les autres écritures, médias ou publications sont renvoyés vers leur capacité gardée ; aucune action arbitraire n'est autorisée |
| Schémas | Types, champs requis, enums/constantes, bornes, tableaux, unions prises en charge ; champs inconnus ou schémas non pris en charge bloqués | Aucun identifiant ou argument inventé ; seules les valeurs par défaut effectivement reçues peuvent compléter les paramètres requis |
| Connexion | Pagination scoped à l'utilisateur, propriétaires étrangers exclus, ambiguïté/inactivité explicites | Le Search géré existant utilise l'authentification de plateforme ; cela n'invente pas une connexion OAuth active |
| Coûts/quotas | Au plus une exécution par opération, zéro retry automatique, HTTP 429/Retry-After remontés ; autres fournisseurs sans politique de coût vérifiée bloqués | **Solde des crédits Composio et coût effectif non mesurés** ; aucune déclaration de crédit gratuit. Politique financière du compte et quota mensuel sociaux non modifiés |
| Idempotence | Réservation durable avant appel, concurrence et changement de contenu contrôlés, résultat incertain conservé | Une interruption n'autorise pas de nouvel appel aveugle ; répétition du même ID réutilise le résultat ou retourne l'incertitude |
| `cultivate` B2B | Besoin du seed → vraie mission → sources → récolte locale à qualifier ; pas de Notion/Mistral imposé | Une recherche vide/bloquée n'est pas une récolte. Même contenu réutilisé au cycle suivant ; `ready-to-offer` non attribué aux sources |
| Prospection, ventes, publications | **0 prospect réel vérifié, 0 contact, 0 commande, 0 publication pendant cette mission** | Les sociétés des tests sont des fixtures réservées `example.org`, jamais de vrais résultats commerciaux |

La permission métier `tools.read` est explicite pour exécuter ; les requêtes sont en preview par défaut. La famille de Search géré déjà présente est la seule lecture exécutée par cette liaison ; une connexion active à Exa/FullEnrich ou autre outil payant ne vaut pas consentement à consommer son quota. La découverte via le connecteur de session a renvoyé Exa/FullEnrich sans connexion active ; cela ne décrit pas le projet Composio du Worker.

Un besoin de média/contenu/publication continue d'utiliser les capacités dédiées existantes. Le catalogue peut découvrir des outils supplémentaires ; il ne transforme pas une description commerciale, une connexion ou un schéma partiel en preuve de génération réussie. Cette PR ne prétend pas fournir un exécuteur universel pour tout nouveau fournisseur inconnu.

## Tests réellement exécutés

- Worker avant correction : **104 réussis / 1 ignoré**. Après correction : **116 réussis / 1 ignoré**, `npm test` et typecheck réussis. Le test Postgres Observatoire reste ignoré sans `TEST_DATABASE_URL`.
- API : **71 tests / 20 fichiers réussis**. Cas ajoutés : relais au Worker, réponses incomplètes, pagination scoped et absence de fallback non scoped/429.
- Poulpe : **108 réussis**, dont quatre scénarios du vrai `gerard-cycle.mjs` dans des jardins temporaires ; recherche indépendante de Notion, résultat incomplet, blocage/absence de sources, doublon, Retry-After par seed.
- `OCTOPUS_APP_PATH=/workspace/mission114-octopus/dist/app.js GERARD_CYCLE_PATH=/workspace/mission114-poulpe/scripts/gerard-cycle.mjs COMPOSIO_PROOF_PATH=/workspace/mission114-proof.json pnpm --filter @workspace/scripts exec tsx --test ./gerard-composio-e2e.test.mts` : **1 parcours complet réussi**, découverte + preview + cinq états : succès simulé, connexion absente, 429, erreur fournisseur applicative et recherche vide. Vrai Octopus actuel, vrai cycle, vrai Express et vrai Worker ; **Composio et SQL simulés**, aucun fournisseur réel exécuté. [Preuve machine](2026-10-24-composio-business-proof.json).
- La CI du test Publisher rejoue le même contrat avec missions versionnées quand le chemin du cycle n'est pas fourni ; les tests Poulpe exécutent le vrai script. Octopus est épinglé au SHA examiné, pas reconstruit.
- Trois E2E Buffer/Metricool existants : **3 réussis**, fournisseurs et SQL simulés ; aucun changement des publications programmées.
- Build/typecheck Publisher : réussi avec `BASE_PATH=/ PORT=5173 DB_PUSH=0`, après correction d'un typage JSON `unknown` dans le nouveau relais. Build Poulpe et build de l'Octopus examiné réussis. Aucune synchronisation de schéma. Avertissements préexistants sourcemaps/chunks conservés.
- `git diff --check` réussi. Le diff du workflow opérationnel Poulpe ajoute uniquement les deux capacités dans son enregistrement existant ; cron, déclencheurs, secrets et étapes de publication identiques. Les fichiers générés de build/snapshot ont été restaurés, pas livrés.

## Vérification réelle et blocages

Depuis l'environnement de travail, trois GET du Worker (`/api/adapter/health`, `/api/observatory/discovery/account`, `/api/observatory/discovery/schema`) renvoient **HTTP 403 / Cloudflare 1010**. Aucun secret Composio n'est disponible localement ; aucune manipulation de secret/connexion n'a été tentée.

La nouvelle CI **de PR uniquement**, sans planification quotidienne, collecte ces mêmes métadonnées depuis un runner GitHub. Elle ne lance ni recherche fournisseur ni publication ; elle valide éventuellement le planner en dry-run sur les schémas réellement reçus. Ses observations horodatées et le résultat de validation sont conservés dans l'artefact `composio-business-evidence` et détaillés dans la PR. Un job vert de ce diagnostic ne signifie pas que le service de production est accessible : il rapporte aussi les HTTP 403/502 explicitement.

Restent à vérifier en production après revue/disponibilité des correctifs : utilisateur/connexion du bon projet Composio, schémas réellement exposés, quota/crédits disponibles et résultat d'une lecture autorisée. Les nouvelles connexions ou dépenses nécessiteraient une autorisation distincte. Aucun résultat commercial réel n'est revendiqué sur la base des fixtures ou des runs `symbiosis`.

Aucune nouvelle architecture/agent, automatisation quotidienne, modification de budget/secret, annulation ou création de publication réelle, déploiement ou fusion effectuée.
