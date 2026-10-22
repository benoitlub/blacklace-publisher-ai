# Natasha — prototype vertical vérifiable

[Ouvrir le MP4 de 10 secondes](natasha-vertical-10s.mp4) · [aperçu](poster.jpg) · [trois instants du montage](contact-sheet.jpg) · [rapport machine](report.json) · [preuve du parcours et de la boucle suivante](e2e-proof.json)

Prototype demandé par l'utilisateur ; le brief et les accroches sont un **exemple technique `user-demo`**, à adapter/valider par Gérard. Il ne s'agit pas d'une décision créative attribuée à Gérard ni d'une publication approuvée.

| Élément | Résultat vérifié |
| --- | --- |
| Fichier | `natasha-vertical-10s.mp4`, 1 401 113 octets |
| Vidéo | 1080 × 1920, 9:16, H.264, yuv420p, 30 images/s, 10 secondes, faststart |
| Son | AAC stéréo silencieux ; aucune voix générée ou clonée |
| Coût | 0 EUR de fournisseur externe ; coût d'infrastructure non mesuré ; coût historique du clip inconnu |
| Publication | Aucune ; destination demandée seulement : Blacklace Island, Instagram `@pro.hbtd` |
| Validation | Décodage complet et contrôles techniques réussis ; choix créatif, droits de diffusion et cohérence finale à valider humainement |

SHA-256 du MP4 : `d78634dfd2a449f1368b22d941c52a11916a09d714349a0d1bfb7235002dfc32`.

Le média source est [Natasha / fragment 03](https://github.com/benoitlub/blacklace-echo/blob/10b3c2bbf0b49c8b1b9e56df43afe9556762c6ce/public/assets/videos/nat3.mp4), associé à Natasha par [le registre du dépôt Blacklace](https://github.com/benoitlub/blacklace-echo/blob/10b3c2bbf0b49c8b1b9e56df43afe9556762c6ce/src/blacklace/data.ts). Source 1280 × 720, durée 10,433 s ; les dix premières secondes sont montées. SHA-256 source : `345eaa73904bdb632a36b45e6d51c0ad4f4410f71bad1ac084a23b6bb3fa16a9`.

L'image entière est ajustée dans le cadre vertical, sans recadrage du visage ni suppression du filigrane Kling existant. Le personnage n'est ni redessiné ni réanimé par cette mission. La comparaison SSIM de la zone vidéo complète après redimensionnement/encodage donne **0,988459**, au-dessus du seuil de régression 0,98. C'est une mesure de fidélité des images, pas une reconnaissance d'identité ou une validation sémantique. Les trois instants du montage ont également été inspectés visuellement.

Storyboard de démonstration :

1. 0–3 s : « LE SIGNAL PASSE. »
2. 3–7 s : « NATASHA / DEPUIS BLACKLACE. »
3. 7–10 s : « ENTREZ DANS / BLACKLACE ISLAND. »

La demande complète est [request.json](request.json). Les titres sont hors de la zone du média, avec police de 64 px et contrôle de largeur réelle des glyphes. Le mouvement et l'ambiance du studio proviennent du clip existant. Les champs scène/action/ambiance n'entraînent aucune génération de nouveaux gestes.

La preuve E2E utilise le vrai client technique, l'Octopus déjà installé, les routes HTTP Publisher réelles, FFmpeg et deux MP4 réellement rendus/téléchargés. Le retour Gérard est une **fixture de test**, qui demande quatre secondes au lieu de trois pour la conclusion ; une seconde création vérifie que ces changements sont repris. L'apprentissage est un enregistrement structuré et une prochaine demande explicite, sans nouvel agent, réécriture autonome ou publication.

Les URLs `/api/production/video/artifacts/...` du rapport correspondent à l'instance locale qui effectue le rendu. Pour examiner ce livrable sans serveur, utiliser directement les liens de fichiers ci-dessus.
