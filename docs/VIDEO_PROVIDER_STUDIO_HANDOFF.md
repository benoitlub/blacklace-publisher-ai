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

1. Choisir **un seul** fournisseur à partir d'une connexion réellement disponible (Runway ou Kling). Vérifier son API, les droits, les quotas et le coût **avant** tout appel payant.
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
