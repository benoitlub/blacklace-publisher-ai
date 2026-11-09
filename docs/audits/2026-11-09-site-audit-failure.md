# Échec de l’audit du portail — 9 novembre 2026

Exécution : https://github.com/benoitlub/blacklace-publisher-ai/actions/runs/42678744971

L’étape d’audit s’arrêtait avant tout appel HTTP : `SyntaxError: Invalid regular
expression flags`, ligne 20 de `scripts/site-agent-audit.mjs`. Le code contenait
des antislashs doublés dans ses expressions régulières. Les mêmes échappements
empêchaient de reconnaître les métadonnées HTML et certains hôtes privés. La
sortie ajoutait aussi les caractères littéraux `\n` au lieu d’un saut de ligne,
ce qui invalidait le fichier JSON.

Le correctif rétablit ces échappements, sans changer le cron, les cibles ni le
caractère exclusivement consultatif de l’audit. La CI existante exécute désormais
ses tests. Aucune automatisation supplémentaire n’est créée.

Vérifications : `node --check scripts/site-agent-audit.mjs` ; quatre tests du
véritable CLI avec fetch simulé : métadonnées et JSON, champs absents, rejet des
hôtes privés/IP/URLs avec identifiants, redirections et contenu non textuel.
Aucun compte, secret, budget, publication ou déploiement n’est modifié.

Lecture réelle du portail avec le proxy et les certificats système du poste de
test : HTTP 200, rapport JSON valide, 8 contrôles satisfaits sur 13 ; robots.txt
et sitemap.xml répondent 404. Ces points restent des recommandations, sans
modification du portail. Le rapport local est `/tmp/publisher-site-audit-fixed.json`.

La première CI du correctif passe les 4 tests d’audit, les 93 tests API, les 12
tests interface, les types et le build, puis bloque sur le hash Piper. La branche
amont du modèle a été réentraînée le 9 novembre à 16:22 UTC : le hash courant
`b1d946fd68d0347155fa59bce0a018924abbef3c1561181db45ca463d83963ef` diffère du hash
attendu. Le téléchargement est désormais épinglé à la révision publique
`e7229f7d33a10e145e109b886d661984201ac3c4`, qui conserve l’empreinte approuvée
`641d1ab097da2b81128c076810edb052b385decc8be3381814802a64a73baf99`.
La configuration et MODEL_CARD sont épinglés ensemble. Le contrôle d’intégrité
reste inchangé ; aucun nouveau modèle n’est accepté silencieusement.

Cet incident est distinct de l’échec Studio du matin : le run Poulpe Fiction
42577164619 signale `MISTRAL_IMAGE_UPSTREAM_FAILED`, HTTP 422. Il ne démontre pas
un quota 429. Les détails de validation amont n’ont pas été conservés ; le schéma
public Mistral consulté accepte les champs de la requête, donc il ne permet pas
de désigner avec certitude le champ rejeté. Aucune génération réelle n’est
relancée pour cette enquête.
