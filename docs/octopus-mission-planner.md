# Octopus — Mission Planner

## Vue d'ensemble

Le **Mission Planner** traduit une intention humaine libre (`UserIntent`) en mission structurée et versionnée (`MissionDefinition`), puis délègue l'exécution au runtime Octopus.

```text
User Intent
  → MissionPlanner        — sélection déterministe de la mission
    → MissionCatalog      — registre versionné des missions disponibles
      → CapabilityResolver / Guardian
        → Coordinator     — orchestration du workflow
          → ModuleTask[]  — exécution atomique, pure, sans I/O externe
```

## Règle d'architecture

Publisher ne contient pas le runtime Octopus.

Le runtime vient du package externe :

```text
octopus-engine → Coordinator, Guardian, ModuleTask, types, defineModule
```

Publisher contient seulement :

- Mission Planner ;
- Mission Catalog ;
- Capability Resolver ;
- workflows métier ;
- modules métier ;
- routes API.

Un seul Octopus. Un seul cerveau.

## Missions reconnues V1

### `draft_article_outline`

Déclencheurs : `plan article`, `outline`.

Capabilities requises :

- `text_generation`
- `outline_builder`

Workflow :

- `extract_topic`
- `build_outline`

### `analyze_client_profile`

Déclencheurs : `client`, `profil`, `analyse`, `analyze`.

Capabilities requises :

- `text_analysis`
- `profile_synthesizer`

Workflow :

- `extract_client_data`
- `synthesize_profile`

## Endpoint API

```http
POST /api/octopus/mission
```

Body :

```json
{
  "text": "analyse ce client",
  "workspaceId": "default",
  "context": {}
}
```

Réponse :

```json
{
  "missionId": "analyze_client_profile",
  "workflowId": "analyze_client_profile",
  "result": {}
}
```

## Sécurité et logs

L'intention complète de l'utilisateur ne doit jamais être loggée.

En erreur, la route ne logge que :

- un code d'erreur ;
- `isClientError`.

## Limites actuelles

- matching lexical déterministe ;
- pas de LLM ;
- pas de Notion ;
- pas d'Instagram ;
- pas d'appel réseau ;
- modules mock/déterministes.

## Prochaines étapes

- brancher `GenerateText` derrière une capability ;
- ajouter une lecture Notion en read-only ;
- enrichir le Mission Catalog ;
- introduire les workspaces et policies par client.
