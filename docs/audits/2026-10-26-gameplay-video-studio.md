# Source vidéo réelle dans Studio Publisher

Publisher `video.studio` accepte désormais un **videoAssetId** facultatif à la place de `assetId` / `imagePrompt`. C'est une évolution du même studio, pas un nouveau moteur ni un nouveau fournisseur.

## Traitement
1. `videoAssetId` pointe vers une entrée **existante** du catalogue local `data/studio-inputs/assets.json`, avec `parcelId`, chemin relatif, SHA-256 et droits validés.
2. Le moteur lit exclusivement cette entrée, exige une vidéo H.264 verticale décodable de 3–60 s, copie sa source dans le dossier de travail et extrait `image.png` comme image de référence.
3. Le chemin existant crée la voix française Piper, la musique, les bruitages et le master `audio.wav`.
4. FFmpeg boucle la vraie séquence de jeu si nécessaire, lui ajoute titre et sous-titres, puis vérifie la durée, le décodage, l'audio et le mouvement.
5. La sortie reste `short.mp4` en **ready-for-review**, jamais une publication.

Aucune URL, fichier arbitraire, ressource transversale ou demande de génération payante ne peut servir de source.

## Handoff depuis Poulpe Fiction
L'Action manuelle `Gerard Reel 420 visual proof`, avec `capture_live_gameplay=true`, livre `gameplay-vertical.mp4` et `review-report.json`. Après capture réelle et vérification, importer les octets comme **asset enregistré** dans le catalogue local Publisher, par exemple :

```json
{
  "id": "owner-420-dice-gameplay-01",
  "parcelId": "420-dice",
  "file": "420-dice-gameplay.mp4",
  "sha256": "<SHA-256 réellement calculé du MP4>",
  "rights": {
    "license": "LicenseRef-Owner-Authorized-Preview",
    "scope": "local-preview",
    "source": "https://benoitlub.github.io/420-dice-game-reboot/",
    "attribution": "Captation du jeu de Benoît Lubert, pour revue privée"
  }
}
```

La mission Studio prend `videoAssetId:"owner-420-dice-gameplay-01"`, des phrases approuvées et `automaticPublication:false`.

## Ce qui n'est pas encore réalisé
- Le MP4 Playwright doit d'abord être produit par une **exécution réelle** de l'Action : la réussite CI ne suffit pas.
- L'import des octets et l'inscription au catalogue ne sont pas automatiques, pour préserver les droits et l'intégrité du fichier.
- Le rendu combiné clip + Piper + effets devra être testé de bout en bout après import d'un véritable média. Aucun Short final ni publication n'est revendiqué par ce changement seul.
- Une vidéo techniquement animée peut rester éditorialement ratée : la revue humaine est conservée.
