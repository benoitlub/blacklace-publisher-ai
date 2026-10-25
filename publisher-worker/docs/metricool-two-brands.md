# Deux marques Metricool dans un projet Composio

Publisher utilise une seule clef `COMPOSIO_API_KEY` et un seul utilisateur `COMPOSIO_USER_ID`.

| Marque | Metricool brand ID | Composio connected account |
| --- | --- | --- |
| Pro.Hibited | `3350145` | `METRICOOL_CONNECTED_ACCOUNT_ID` (configuration existante) |
| Blacklace | `7653100` | `METRICOOL_BLACKLACE_CONNECTED_ACCOUNT_ID` |

## Activation en toute sécurité

1. Dans **le projet Composio déjà utilisé par Publisher**, créer une deuxième connexion Metricool pour le compte `prohibitedvlc@gmail.com`, autoriser Blacklace et TikTok `@beniblacklace`.
2. Récupérer l'identifiant **connected account** Composio correspondant. Il ne s'agit pas du brand ID Metricool (`7653100`).
3. Ajouter cet identifiant comme variable serveur `METRICOOL_BLACKLACE_CONNECTED_ACCOUNT_ID` sur `blacklace-publisher-worker`. Ne pas changer `COMPOSIO_API_KEY`, `COMPOSIO_USER_ID` ou la connexion Pro.Hibited.
4. Vérifier en lecture seule : `GET /api/production/metricool-blacklace/status`.

Résultats possibles : `connected` signifie que la marque et TikTok sont reconnus ; `blocked` contient un code de diagnostic, sans secrets.

**Important :** la publication TikTok est encore bloquée. Elle ne sera activée que lorsque l'historique publié et programmé (tous formats), le quota gratuit et la confirmation du post sont couverts par des appels fournisseur fiables. Aucun autre compte ni publication existante ne doit être supprimé pour réaliser cette configuration.

Le secret historique `Composio2` peut rester présent provisoirement mais n'est plus utilisé par ce routage.
