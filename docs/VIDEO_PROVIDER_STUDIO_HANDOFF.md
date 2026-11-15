# Génération vidéo externe → Studio Publisher : contrat de raccordement

Statut : **préparation, non activé**. Ce document ne prétend pas qu'un fournisseur vidéo a été exécuté.

## Circuit existant à conserver

- `artifacts/api-server/src/routes/connectors.ts` référence Runway et Kling dans le catalogue Composio ; une connexion annoncée ne prouve pas une génération.
- `artifacts/api-server/src/publisher/production-engine/producer-registry.ts` référence Kling comme producteur vidéo **not-configured** ; aucun `execute` vidéo distant n'y est fourni.
- `artifacts/api-server/src/publisher/studio/engine.ts` orchestre les capacités `image.studio`, `audio.studio`, `video.studio`.
- `artifacts/api-server/src/publisher/studio/video.ts` sait intégrer un `videoAssetId` **déjà enregistré et vérifié** (vidéo H.264 verticale, durée 3–60 s, décodage complet), puis produire un MP4 avec audio et sous-titres.
- `artifacts/api-server/src/publisher/studio/runtime.ts` lit les médias du catalogue local `data/studio-inputs/assets.json` ; une URL externe brute n'est pas une entrée acceptée.
- `docs/audits/2026-10-26-audiovisual-studios.md` prouve un montage local, pas une génération de scène distante.

## Première intégration autorisable (sans nouvelle architecture)

1. Choisir **un seul** fournisseur à partir d'un accès réellement disponible (Agnes Video 2.5 Flash en priorité ; Runway ou Kling en alternatives). Vérifier son API, les droits, les quotas et le coût **avant** tout appel payant.
2. Ajouter un adaptateur derrière le registre de producteurs existant : `submit` → identifiant de tâche → `poll` borné → téléchargement. Ne jamais assimiler une tâche acceptée à une vidéo produite.
3. Télécharger dans un répertoire isolé ; contrôler taille, MIME effectif, codec, durée, dimensions, décodage intégral, SHA-256, provenance et droits d'usage. Refuser les URL arbitraires et les redirections non sûres.
4. Enregistrer **uniquement après vérification** la vidéo dans le catalogue local existant, avec identifiant de parcelle et droits ; fournir ensuite ce `videoAssetId` au Studio. Conserver l'original et l'identifiant de tâche fournisseur.
5. Laisser le Studio produire son MP4 final, ses sous-titres, son poster et son rapport `ready-for-review`. Ne pas transformer ce statut en permission de publication.
6. Conserver les décisions Guardian et les validations de publication existantes. Ne pas modifier les programmations Metricool.

## Tests indispensables avant activation

- Absence de connexion : résultat `not-configured`, **aucune** génération factice présentée comme réelle.
- API 401/403, 429, 5xx, timeout, tâche échouée et tâche encore en cours : états explicites, pas de double facturation par relance implicite.
- URL inaccessible ou malveillante, réponse HTML, faux MP4, mauvais codec, dimensions/durée hors limites, média tronqué : rejet sans enregistrement.
- Vidéo valide : enregistrement parcellaire, empreinte, montage réel et archivage contrôlé.
- Quota et coût inconnus : blocage de génération automatique jusqu'à autorisation.
- Test de bout en bout : identifiant de tâche fournisseur + fichier vidéo réel vérifié + rapport Studio ; publication sociale **non** déduite du seul rendu.

## Critère de réussite

Le raccordement n'est déclaré opérationnel qu'avec un **fichier vidéo réellement généré par le fournisseur**, un identifiant de tâche, son hash, son entrée dans le catalogue, puis un MP4 Studio validé. Un test simulé ou un simple statut de connexion ne suffit pas.

## Candidat prioritaire : Agnes Video 2.5 Flash (recherche du 15 novembre 2026)

Sources : [catalogue officiel Agnes](https://github.com/AgnesAI-Labs/skills/blob/main/agnes-ai-models/references/model_catalog.md) ; [référence API technique](https://github.com/techdou/agnes-ai-generation-skill/blob/main/references/api.md).

- Base : `https://apihub.agnes-ai.com`. Créer via `POST /v1/videos` avec `Authorization: Bearer <AGNES_API_KEY>` (clé serveur uniquement).
- Payload minimal : `{ "model":"agnes-video-2.5-flash", "mode":"text", "prompt":"...", "seconds":"5", "size":"720P", "aspect_ratio":"9:16" }`.
- Résultat asynchrone : conserver `video_id` de la réponse, puis interroger `GET /agnesapi?video_id=<ID>&model_name=agnes-video-2.5-flash`. États `queued`, `in_progress`, `completed`, `failed`. Ne télécharger que sur `completed` et après validation de l'URL.
- Contraintes : 4–12 s, 720p, 9:16 possible ; promotion **temporaire** affichée à 0 $/seconde dans la documentation. Le prix réel et l'accès doivent être confirmés par la console et la clé avant exécution ; la file gratuite peut être saturée.
- Aucun `AGNES_API_KEY` ni quota n'a été vérifié. **Pas d'appel payant, pas de génération automatique ni de publication activée par cette PR.**
- Le producteur Agnes doit être opt-in, avec budget maximal explicite à zéro, et ne doit jamais basculer silencieusement vers `agnes-video-2.5` (payant).
- Le format de sortie et les droits devront être validés par `registeredAsset` et `prepareGameplaySource` avant montage. La limite existante de 30 Mio et les contraintes de codec/durée s'appliquent ; conversion locale uniquement avec provenance conservée si nécessaire.
