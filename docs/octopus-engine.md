# Octopus Engine dans Blacklace Publisher AI

Blacklace Publisher AI consomme désormais `octopus-engine` comme package externe.

Le dépôt source d'Octopus Engine est :

https://github.com/benoitlub/octopus-engine

## Règle

Blacklace Publisher AI ne copie pas Octopus Engine.

Publisher utilise le runtime commun et conserve uniquement son métier applicatif.

## Ce que Publisher apporte

Publisher est une application.

Il apporte :

- son interface utilisateur ;
- sa persona éditoriale ;
- ses workflows métier ;
- ses modules métier ;
- son Mission Planner ;
- son Mission Catalog ;
- ses connecteurs configurés ;
- ses données métier ;
- ses objectifs produit.

## Ce qu'Octopus Engine apporte

`octopus-engine` fournit :

- les types communs ;
- `Coordinator` ;
- `Guardian` ;
- `ModuleTask` ;
- `defineModule` ;
- les contrats `WorkflowDefinition`, `MissionDefinition`, `Capability`, `UserIntent`.

## Correspondance actuelle

| Octopus Engine | Blacklace Publisher AI |
| --- | --- |
| Application | Blacklace Publisher AI |
| Conductor / Persona | Interface éditoriale Feuch Institute / client |
| Mission Planner | Sélectionne une mission depuis une intention utilisateur |
| Mission Catalog | `draft_article_outline`, `analyze_client_profile` |
| Workflow | Workflows déclaratifs Publisher |
| Module Task | Modules métier purs, sans réseau ni LLM |
| Capability | `text_generation`, `outline_builder`, `text_analysis`, `profile_synthesizer` |
| Guardian | Validation des capabilities requises |
| Coordinator | Exécution séquentielle des workflows |

## Endpoint disponible

```http
POST /api/octopus/mission
```

Exemple :

```json
{
  "text": "analyse ce client",
  "workspaceId": "default",
  "context": {}
}
```

## Règles de protection

- Ne jamais recréer `Coordinator`, `Guardian`, `ModuleTask` ou les contrats Octopus dans Publisher.
- Toute brique générique doit vivre dans `octopus-engine`.
- Toute brique spécifique à Publisher reste dans Publisher.
- L'intention utilisateur complète ne doit pas être loggée.
- Les workflows actuels restent sans LLM, sans connecteur réel et sans appel réseau.

## Statut

Publisher est maintenant consommateur logiciel d'Octopus Engine, pas simple consommateur conceptuel.

Un seul Octopus. Un seul cerveau.
