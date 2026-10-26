# Audit des studios après fusion — 26 octobre 2026

Base examinée : `8e04152` (inclut les retours créatifs #163 et la source vidéo réelle #167). Cet audit préserve ces évolutions et les publications existantes.

## Deux faux succès d'archive reproduits

Le cache de `runStudio` vérifiait les hashes de `old.files`, puis retournait son statut. Un manifeste vide ne vérifiait rien. Un manifeste avec un hash exact d'octets arbitraires pouvait également retourner `ready-for-review`, même si le fichier n'était pas un MP4.

Deux tests avant correction échouent en montrant ces retours `ready-for-review`. Après correction :

- Le rapport doit correspondre à l'identité et à la capacité demandées, avec un manifeste non vide, sans doublon ni chemin sortant de l'archive.
- Le descripteur principal doit correspondre à l'entrée du manifeste ; tailles et SHA-256 sont contrôlés sur les octets réels.
- Le fichier principal est sondé et ses caractéristiques comparées à la demande : MP4 H.264/AAC 1080 × 1920 à 30 fps, pixels yuv420p, stéréo 48 kHz et durée attendue ; WAV PCM stéréo 48 kHz ou PNG 1080 × 1920 pour les autres studios.
- Un rapport manquant, illisible ou un fichier altéré bloque la réutilisation ; aucun appel fournisseur aveugle n'est relancé.
- L'écriture du rapport utilise un fichier temporaire puis un renommage atomique.
- Le master audio fraîchement produit est également sondé et décodé avant succès, y compris en mode audio seul.

Cela vérifie l'existence et les propriétés techniques du média ; aucune conformité créative ou authenticité sémantique du gameplay n'est inférée de son codec.

## Défauts corrigés côté Gérard

Le cycle réécrivait `allowMistralImage:false` en `true` lorsque l'image était activée sans média enregistré. Le test du vrai script reproduit cet ajout de permission. Le correctif conserve le refus et n'assimile plus activation locale et consentement à consommer un fournisseur.

Le client ignorait aussi certaines options créatives et comparait la durée au rapport, potentiellement absent. Il rejette désormais explicitement les voix/musiques/réglages non pris en charge, conserve style/ratio du prompt et contrôle le fichier selon la demande d'origine. La preuve E2E utilise le client corrigé de la PR Poulpe compagnon.

## Tests exécutés

- Avant correction : **2 échecs / 9 réussites** dans la suite ciblée du cache ; refus Mistral écrasé et fournisseur de voix ignoré reproduits séparément.
- Après correction : **88 tests API réussis**, **156 tests Poulpe réussis**, builds/types Publisher et build Poulpe réussis.
- E2E réel : vrai cycle Gérard → Octopus existant → vraies routes Express → vrais Piper/FFmpeg → MP4 téléchargé et vérifié. Réutilisation du cache client et du cache serveur vérifiée, altération rejetée ; aucun moteur de rendu simulé ni appel fournisseur payant. [Preuve JSON](2026-10-26-studio-audit-proof.json).
- Les tests de propagation des retours créatifs et de sélection `videoAssetId` restent verts. Les résultats CI définitifs sont joints aux PR.

## Limites restantes, sans faux succès

Au moment de l'audit, `data/studio-inputs/assets.json` contient un visuel, **aucune source vidéo enregistrée**. La voie gameplay de #167 ne possède donc pas encore de preuve intégrée avec une vraie captation du jeu et sa voix. Il faut d'abord obtenir/importer ce média et ses droits, puis exécuter ce parcours. Cet audit ne fabrique ni captation ni preuve de gameplay.

Les consignes créatives libres sont archivées et explicitement marquées à revoir, pas automatiquement garanties. Les crédits et générations de Mistral/Canva/ElevenLabs ne sont pas revalidés en consommant leurs quotas. Le Short déjà livré et les fichiers médias existants ne sont ni remplacés ni publiés par cet audit.

Aucun nouveau workflow, cron, service, agent, abonnement, secret, budget, déploiement, fusion ou publication.
