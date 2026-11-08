# Réparation Mistral image — 8 novembre 2026

Base Publisher : `388824d4e6f18d9e7872f455db7118dd74e7cd89`.
Poulpe lu sur main, notamment `docs/gerard-mistral-diagnostic-2026-11-08.md`.
Aucun changement de secret, budget, état du jardin ou publication programmée.

## Avant / après

| Point | Avant | Après |
| --- | --- | --- |
| Studio avec clé Mistral locale | Appelle malgré tout le Worker déployé et ses propres clés | Utilise la clé locale existante ; le chemin Worker reste disponible sans clé locale |
| Création d’image | Création d’un agent distant à chaque tentative | Une conversation avec modèle, instructions et outil image intégrés ; aucun agent distant créé |
| Choix de la clé | La clé générique pouvait masquer MISTRAL_API_KEY | La clé Mistral spécifique est prioritaire, sans modifier sa valeur |
| Preuve de génération | Recherche récursive de n’importe quel file_id ; mauvais champ de conversation | Uniquement un tool_file image_generation dans une sortie assistant ; conversation_id conservé |
| Erreurs | 502 puis MISTRAL_IMAGE_UNCONFIRMED | Statut amont, étape, endpoint, modèle et Retry-After conservés ; aucun corps fournisseur ni secret exposé |
| Quota 429 | Opération réservée définitivement en échec | Attente du délai, puis reprise sous verrou de la même opération ; une seule tentative active |
| Fichier accepté, téléchargement interrompu | fileId perdu côté Studio, aucune reprise sûre | Identifiant enregistré avant téléchargement ; la reprise relit ce fichier sans nouvelle génération |
| Résultat ambigu | L’ancien chemin média pouvait relancer puis basculer de fournisseur | Pas de relance/fallback après 429 ou résultat Mistral incertain |
| Autorisations | Refus explicite des templates | Refus conservé, même lorsqu’une clé locale existe |

Les modifications restent dans les moteurs et endpoints existants. Aucun nouvel
agent intelligent, ordonnanceur, workflow ou fournisseur n’est ajouté. Dans la CI
existante, les tests API sont déplacés après la vérification FFmpeg : ils décodent
maintenant effectivement un PNG de test.

## Validation exécutée

- Suite Studio API : **16 tests réussis**, dont 5 nouveaux tests de transport/reprise.
- Suite Worker : **146 réussis, 1 ignoré**, aucun échec. Le test Postgres exige
  TEST_DATABASE_URL ; aucune base distante n’a été sollicitée.
- TypeScript Worker : réussi.
- TypeScript strict ciblé : service partagé, moteur Studio et nouveaux tests : réussi.
- `git diff --check` : réussi.
- Dans la simulation : vraie fixture PNG créée par FFmpeg, téléchargement simulé,
  décodage réel, export PNG 1080 × 1920, hash et archive relus.
- Cas vérifiés : clé spécifique prioritaire ; absence de permission ; 401/402/403/429 ;
  Retry-After ; absence de fichier ; HTML rejeté ; téléchargement interrompu ;
  cache vérifié ; reprise concurrente sans double génération ; ancien endpoint média
  sans relance/fallback après résultat incertain.

Toutes les réponses Mistral de ces tests sont simulées. Aucun fichier n’est
présenté comme une nouvelle image Mistral. Les nouvelles suites n’appellent pas
Composio ni les transports sociaux.

## Références du contrat Mistral

- [Outil image](https://docs.mistral.ai/agents/tools/built-in/image_generation).
- [ConversationRequest : modèle, outils et completion_args, sans agent obligatoire](https://github.com/mistralai/client-ts/blob/main/src/models/components/conversationrequest.ts).
- [ConversationResponse : conversation_id](https://github.com/mistralai/client-ts/blob/main/src/models/components/conversationresponse.ts).
- [ToolFileChunk : tool et file_id](https://github.com/mistralai/client-ts/blob/main/src/models/components/toolfilechunk.ts).

## Limites et activation

Aucun quota réel ni accès effectif à l’outil image du compte n’est certifié par
ces simulations. Une clé configurée ne prouve pas que le compte autorise cet outil.
Une réponse 429 ne permet pas de distinguer débit et budget.

Les anciens rapports MISTRAL_IMAGE_UNCONFIRMED restent réservés : ils ne permettent
pas de savoir si une génération a été facturée. Ils ne sont ni effacés ni relancés
automatiquement. Après examen des preuves historiques, une nouvelle demande peut
être créée avec un nouvel operationId explicite.

Le chemin Studio local bénéficie du correctif lorsque sa révision Publisher
contient ces changements ; il n’exige pas de déployer le Worker. L’endpoint Worker
déployé restera à son ancienne version jusqu’à un déploiement autorisé séparément.
Aucun déploiement ou fusion n’est exécuté ici. Attention : la fusion sur main peut
déclencher les workflows de déploiement déjà présents dans le dépôt.

Pour une confirmation réelle, une tentative unique de génération doit être
autorisée séparément car elle peut consommer des crédits. Il faudra conserver
conversationId, fileId, octets décodables, dimensions et SHA-256. Cette autorisation
n’autorise aucune publication. En cas de refus 401/403/402, rétablir l’accès au
compte ou décider du budget avant toute nouvelle tentative ; aucun secret dans le chat.
