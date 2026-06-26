# Octopus Engine dans Blacklace Publisher AI

Blacklace Publisher AI utilise Octopus Engine comme référence d'architecture.

Le dépôt source d'Octopus Engine est :

https://github.com/benoitlub/octopus-engine

## Règle

Blacklace Publisher AI ne copie pas Octopus Engine.

Il l'applique progressivement.

## Ce que Publisher apporte

Publisher est une application.

Il apporte :

- son interface utilisateur ;
- sa persona éditoriale ;
- ses workflows de publication ;
- ses policies client ;
- ses connecteurs configurés ;
- ses données métier ;
- ses objectifs produit.

## Ce qu'Octopus apporte

Octopus fournit le modèle de référence :

- Conductor / Persona ;
- Coordinator Runtime ;
- Workflows déclaratifs ;
- Module Tasks ;
- Capabilities ;
- Connectors ;
- Policies ;
- Guardian ;
- Memory ;
- Tracing ;
- règles de frontières.

## Correspondance actuelle

| Octopus Engine | Blacklace Publisher AI |
| --- | --- |
| Application | Blacklace Publisher AI |
| Conductor / Persona | Interface éditoriale Feuch Institute / client |
| Mission | Objectif utilisateur : publier, analyser, prospecter, préparer |
| Workflow | Futurs workflows déclaratifs Publisher |
| Module Task | Travail local donné à une brique IA ou métier |
| Capability | Générer, résumer, analyser, publier, lire Notion, lire GitHub |
| Connector | Notion, GitHub, Mistral, Meta, autres providers |
| Guardian | Sécurité, coûts, quotas, validation humaine, blocages critiques |
| Policies | Réglages client, budget, autonomie, ton, plateformes |

## Règles de protection

- Ne pas intégrer de runtime Octopus complet tant que les schémas minimaux ne sont pas définis.
- Ne pas faire grossir Publisher avec une pseudo-architecture Octopus bricolée localement.
- Toute brique générique doit être proposée dans `octopus-engine` avant d'être copiée ici.
- Toute brique spécifique à Publisher reste dans Publisher.

## Prochaine étape raisonnable

Ajouter une couche de mapping documentaire, pas de runtime.

Le premier vrai branchement technique devra attendre les schémas :

- Workflow ;
- Module Task ;
- Capability ;
- Policy ;
- Trace.

Tant que ces contrats ne sont pas stabilisés, Publisher reste consommateur conceptuel d'Octopus, pas consommateur logiciel.