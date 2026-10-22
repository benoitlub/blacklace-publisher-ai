# Gérard commande une vidéo à Publisher — audit et première preuve

Référence : [issue #137](https://github.com/benoitlub/blacklace-publisher-ai/issues/137). Cette PR constitue les premières étapes : registre, paquet structuré, montage local, récupération du MP4, contrôles et apprentissage explicite. Le ticket reste ouvert pour la validation humaine, les moteurs payants éventuels et la livraison sociale ultérieure.

## Audit des capacités

| Étape / outil | Preuve disponible | Accessibilité et limite |
| --- | --- | --- |
| Médias officiels | Dépôts utilisateur `blacklace-echo` et `blacklace-island` : mêmes blobs Natasha/Marty ; le code associe les fichiers aux personnages | Registre restreint à des références revues, URL épinglée au commit, taille et SHA-256 vérifiés. Pas de banque de médias externe ni URL arbitraire dans la demande. |
| Storyboard | Ancienne tâche `video.storyboard` du gateway : routable vers Mistral/mock, pas un moteur MP4 | Nouvelle validation déterministe des choix **fournis par Gérard**, sans appel LLM : textes, intervalles, scène, action, ambiance. |
| Morphic | Mention dans le profil de connaissances ; aucun adaptateur exécutable ni accès exact trouvé dans le code ou la découverte Composio | Non prouvé, non annoncé comme disponible ; aucun appel ni connexion créée. |
| Kling | Entrée `video` du registre de production, statut `not-configured`, aucun `execute` ; aliases `kling`/`klingai` dans les connecteurs | Aucun accès API, quota ou coût gratuit vérifié. La présence d'anciens clips avec filigrane Kling n'est pas une autorisation de génération. |
| Canva / Composio | Intégration existante orientée visuels. Découverte de `CANVA_POST_EXPORTS`, format `mp4` avec `vertical_1080p`, tâche asynchrone ; lecture de formats par design et polling nécessaires | Connexion Canva inactive **dans cette session**. Rien ne prouve les droits, formats du design ni crédits dans le projet Composio du Worker. Aucun export démarré. |
| Voix ElevenLabs | Connexion active dans le connecteur de session, outils de voix et TTS découverts | Coût/quotas et droits de voix non vérifiés ; aucun TTS exécuté. Une connexion de session ne prouve pas celle de Publisher. V1 : silence explicitement choisi. |
| Animation | Clips Natasha et Marty déjà animés | Réutilisation des mouvements existants seulement ; pas de synthèse de geste, de lip-sync ni de nouveau visage. |
| Assemblage et export | FFmpeg local 7.1.5, encodeurs H.264/AAC, polices DejaVu ; MP4 réellement rendu | Exécutable dans l'API Node locale équipée de ces dépendances. Pas dans le Worker Cloudflare. Aucun remplacement d'Octopus. |
| Contrôle qualité | FFprobe, décodage complet, taille/durée/codage, faststart, SHA-256, largeur de légendes ; SSIM > 0,98 dans l'E2E | Identité visuelle finale, qualité narrative, geste et droits de diffusion restent à relire. Aucun classifieur inventé ne les déclare approuvés. |
| Apprentissage | Comparaisons attendues/observées, défauts et changements explicites ; E2E avec seconde création | Gérard fournit son jugement. Publisher enregistre le retour et prépare la prochaine demande ; aucun rendu, correction créative ou envoi automatique. |

Le catalogue est consultable par `video.catalog` dans Octopus et `GET /api/production/video/catalog` sur l'API locale. Il expose les références, étapes, coûts inconnus, limites et `runtimeReady`. Ce dernier vérifie FFmpeg/FFprobe, les encodeurs, filtres et police nécessaires ; aucune clé présente n'est assimilée à une capacité vérifiée.

## Références et identité

Commit source : `benoitlub/blacklace-echo@10b3c2bbf0b49c8b1b9e56df43afe9556762c6ce`, mapping `src/blacklace/data.ts`.

- **Natasha** : `nat3.mp4`, 3 934 225 octets, 1280 × 720, 10,433 s. Blob Git `41dd64be4ed74800ab44cda895188eca7b5fdd2f`. SHA-256 dans le registre et le rapport. Source inspectée et utilisée pour le prototype.
- **Marty** : `marty.mov`, 14 637 396 octets, 1080 × 1920, 5,042 s, piste audio. Blob `d338ff93e801d01a1b669ff9eaa6c927430a6cf9`, SHA-256 `dca00a84c4a3faa082a02d149808869c31424898c21ffae9771dbafa451d5e40`. Téléchargement, empreinte et FFprobe vérifiés ; aucun montage Marty n'est annoncé testé. Une demande de 8–15 s exige un choix explicite de répétition ; pas d'allongement tacite. La V1 silencieuse n'utilise pas sa voix.
- **Aloisia** : les sources décrivent une présence diffuse/invisible. Aucune référence visuelle vérifiée trouvée ; **aucun corps ou visage inventé**. Ses demandes de rendu sont bloquées tant qu'une référence appropriée n'a pas été fournie/revue.

`prohibited-online/assets/references/README.md` confirme que les références de cartes physiques ne sont pas encore dans ce dépôt ; elles ne sont pas remplacées par des images supposées officielles. Les références Notion des personnages sont citées, sans prétendre en avoir réimporté toute la bible. La réutilisation est demandée par l'utilisateur propriétaire des dépôts ; cela ne certifie pas une licence générale de diffusion commerciale. Les filigranes existants sont conservés et la publication exige sa propre revue.

## Contrat et exécution existante

`video-package-v1` contient personnage/référence, scène, action, durée, point de départ, répétition explicite, 9:16, ambiance, storyboard horodaté, destination projet/plateforme/compte, choix silencieux, coût externe maximal **0** et publication automatique **false**. Un éventuel `learningFrom` cite l'artefact précédent, défauts et améliorations. La validation conserve ces choix ; elle refuse les champs inconnus, fournisseurs/voix payants, images d'un autre personnage, URL/commande/chemin arbitraire et textes hors limites mobiles.

L'adaptateur Publisher existant déclare `video.catalog`, `video.prepare`, `video.render`, `video.review`. Une mission vidéo contient une seule capacité. `video.render` et `video.review` exigent une ressource autorisée explicite ; les routes sont limitées au loopback et refusent `X-Forwarded-For`. Le répertoire d'artefacts est défini côté serveur (`PUBLISHER_VIDEO_DIR` ou `data/video`), jamais par le paquet. Aucun secret nouveau, migration, service de file ou second agent.

Le rendu et son rapport sont identifiés par le hash du paquet, de la référence et du profil de rendu. Un dossier créé atomiquement évite les rendus identiques concurrents ; un fichier existant est revalidé par son empreinte avant réutilisation. Le client vérifie le statut, l'origine/chemin de téléchargement, MIME, taille et SHA-256 du MP4. Une réponse acceptée ou un ID seul n'est jamais un artefact livré. Échec et interruption ne déclenchent aucun retry automatique ; après une correction de dépendance ou un rendu interrompu, examiner le rapport/dossier local avant une nouvelle tentative.

Les scènes et actions demandées sont conservées dans le rapport, mais FFmpeg ne les génère pas. Une source trop courte est refusée sauf répétition explicite. Les légendes dépassant la largeur réelle disponible sont refusées au lieu d'être tronquées. Le retour `ready-for-review` signifie MP4 techniquement prêt, **pas** approbation créative.

## Utilisation par Gérard

Sur l'instance **locale existante** de Publisher/Octopus, avec FFmpeg, FFprobe et `fonts-dejavu-core` installés :

```bash
# Vérifier/ajouter les capacités vidéo du même adaptateur local et préparer.
OCTOPUS_URL=http://127.0.0.1:3000 PUBLISHER_URL=http://127.0.0.1:3001 \
  node scripts/video/gerard-client.mjs docs/prototypes/natasha/request.json --register

# Rendre la demande explicite et récupérer le MP4 + son rapport vérifiés.
OCTOPUS_URL=http://127.0.0.1:3000 PUBLISHER_URL=http://127.0.0.1:3001 \
  node scripts/video/gerard-client.mjs docs/prototypes/natasha/request.json --render --out /tmp/gerard-natasha
```

Le client expose aussi `videoReviewMission` et `submitVideoMission`. Un retour contient `artifactId`, `reviewer`, `comparisons` (`criterion`, `expected`, `observed`, `result`) et `nextChanges` choisis par Gérard. Le résultat retourne `nextPackage`, prêt pour une **nouvelle commande explicite**. Voir le test E2E pour un exemple complet exécuté.

`--register` est opt-in : vérifie les dépendances de l'API locale, lit le registre Octopus existant, conserve ses capacités sociales/contenu et refuse de remplacer un adaptateur dont l'URL est différente. Aucun enregistrement dans le service distant n'a été effectué pendant cette mission. Le cron Poulpe contient encore sa liste de capacités sans vidéo : il n'a pas été modifié. Un branchement au cycle autonome sera une décision distincte, après revue du prototype et de la commande de Gérard.

## Première preuve et tests exécutés

[Prototype Natasha, MP4, images et rapport](../prototypes/natasha/README.md). 10 s, 1080 × 1920, H.264/AAC silencieux, MP4 de 1 401 113 octets. SHA-256 `d78634dfd2a449f1368b22d941c52a11916a09d714349a0d1bfb7235002dfc32`. Décodage complet réussi ; comparaison de la zone vidéo avec le clip officiel **SSIM 0,988459** ; trois instants inspectés visuellement. Zéro nouvelle génération.

Validations locales, Node 24.19.0 et pnpm 10.32.1 :

- API `pnpm --filter @workspace/api-server test` : **73 tests / 19 fichiers réussis** (six nouveaux cas vidéo).
- Client `node --test scripts/video/gerard-client.test.mjs` : **4 réussis**, dont refus de fichier altéré, URL externe et changement d'adaptateur.
- Vidéo `PUBLISHER_VIDEO_TEST_SOURCE=/workspace/video-audit/source/nat3.mp4 PUBLISHER_VIDEO_PROOF_PATH=/workspace/video-audit/gerard-video-proof.json pnpm --filter @workspace/scripts exec tsx --test ./gerard-video-e2e.test.mts` : **1 scénario complet réussi**, deux MP4 réellement créés et téléchargés, feedback de Gérard simulé explicitement, réutilisation sans nouveau rendu. Les octets officiels ont été téléchargés auparavant puis fournis comme fixture du transport GET ; ils restent vérifiés par le SHA-256 de production. Le test n'autorise aucun fournisseur IA, Composio ou réseau social. En CI, sans ce chemin local, seul le GET GitHub épinglé est autorisé en plus du loopback.
- Régression `pnpm --filter @workspace/scripts exec tsx --test ./gerard-metricool-e2e.test.mts ./gerard-buffer-e2e.test.mts` : **3 réussis**, fournisseurs sociaux et SQL entièrement simulés.
- `BASE_PATH=/ PORT=5173 DB_PUSH=0 pnpm run build` : types et build Publisher vérifiés ; aucun push de schéma. Les avertissements préexistants de sourcemaps/chunks restent documentés.
- `git diff --check` réussi ; aucun changement dans `publisher-worker/`, les workflows sociaux ni le dépôt Poulpe Fiction. Les PR Buffer/Metricool précédentes restent intactes.

Le premier essai du contrôle des glyphes attendait les métriques d'une ancienne version FFmpeg ; il a été corrigé pour FFmpeg 7 (largeurs fixes en 1/64 px) puis le rendu et l'E2E ont réussi. Les échecs initiaux ne sont pas présentés comme des vidéos produites. Les comptes de tests ci-dessus proviennent des commandes complètes, pas des essais sous bac à sable dont le rapport ne détaillait que les fichiers.

La nouvelle CI PR installe les outils vidéo libres, teste le client et le vrai parcours local ; aucun secret, génération payante, cron ou déploiement. Sa preuve JSON est conservée comme artefact de test.

## Limites et décisions restantes

- Relecture humaine de l'identité de Natasha, du ton, des textes et des droits avant tout usage public. Le prototype est démonstratif ; Gérard garde toutes les décisions créatives.
- Ajouter des références validées pour Aloisia et davantage de plans ; tester séparément tout moteur génératif après accès, coût et autorisation explicites. Aucune dépense autorisée par l'issue seule.
- Mettre à disposition l'API Node équipée et choisir le branchement au cycle de Gérard après revue ; aucune mise en production effectuée ici.
- La destination `@pro.hbtd` est tracée dans le paquet/rapport, mais aucun envoi au canal n'est effectué ou revendiqué. La preuve de livraison sociale de l'issue #137 reste différée. Les garde-fous compte/quota/statut de Buffer/Metricool restent applicables ; leur problème d'accès de production n'est pas contourné.

Aucune publication, programmation sociale, appel de génération payante, connexion de compte, changement de secrets/budgets, reconstruction d'Octopus ou fusion/déploiement.
