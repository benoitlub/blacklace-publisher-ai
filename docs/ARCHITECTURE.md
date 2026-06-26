# Architecture — Feuch Institute Blacklace Publisher AI

---

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────┐
│                   Navigateur (React + Vite)             │
│  Dashboard / Calendar / Posts / Campaigns / Agents /    │
│  Connectors / Settings                                   │
│                                                         │
│  TanStack Query ←→ Hooks générés (Orval)               │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP /api/*
┌────────────────────────▼────────────────────────────────┐
│              API Server (Express 5 + Node.js 24)        │
│                                                         │
│  /api/agents        /api/posts       /api/campaigns     │
│  /api/connectors    /api/settings    /api/dashboard     │
│  /api/calendar      /api/generate                       │
│                                                         │
│  services/mistral.ts  services/notion.ts               │
└────────────────────────┬────────────────────────────────┘
                         │ Drizzle ORM
┌────────────────────────▼────────────────────────────────┐
│              PostgreSQL (Replit managed)                 │
│                                                         │
│  agents / posts / campaigns / settings                  │
└─────────────────────────────────────────────────────────┘
```

---

## Monorepo pnpm

```
artifacts/
├── api-server/      @workspace/api-server    — Backend Express
└── blacklace-publisher/  @workspace/blacklace-publisher — Frontend
lib/
├── api-spec/        @workspace/api-spec      — OpenAPI + codegen config
├── api-client-react/ @workspace/api-client-react — Hooks générés
├── api-zod/         @workspace/api-zod       — Schémas Zod générés
└── db/              @workspace/db            — Schéma Drizzle
```

---

## Contrat API (OpenAPI-first)

1. **Source de vérité** : `lib/api-spec/openapi.yaml`
2. **Codegen** : `pnpm --filter @workspace/api-spec run codegen`
3. **Génère** :
   - `lib/api-client-react/src/generated/api.ts` — hooks React Query
   - `lib/api-zod/src/generated/api.ts` — schémas Zod pour le serveur

Ne jamais modifier les fichiers générés manuellement. Toujours modifier `openapi.yaml` puis relancer le codegen.

---

## Base de données

**Moteur** : PostgreSQL (géré par Replit en dev, migratable vers Supabase/Neon)  
**ORM** : Drizzle ORM  
**Migration** : `pnpm --filter @workspace/db run push` (dev uniquement)

### Tables

| Table | Description |
|-------|-------------|
| `agents` | Agents éditoriaux avec personnalité et statut |
| `posts` | Publications avec statut de workflow complet |
| `campaigns` | Campagnes editoriales regroupant des posts |
| `settings` | Configuration singleton (une seule ligne) |

### Champs clés de `posts`

```sql
status: 'draft' | 'approved' | 'scheduled' | 'published' | 'failed'
scheduledAt: TEXT -- ISO 8601, nullable
agentId: INTEGER REFERENCES agents(id)
campaignId: INTEGER REFERENCES campaigns(id)
```

---

## Services externes

### Mistral AI (`services/mistral.ts`)

- Lecture de `MISTRAL_API_KEY` depuis env
- Modèle : `mistral-small` (le plus rapide et économique)
- Mode mock intégré si clé absente — retourne des textes prédéfinis par agent
- Ne plante jamais : `try/catch` avec fallback mock

### Notion (`services/notion.ts`)

- Lecture de `NOTION_API_KEY` + `NOTION_DATABASE_ID`
- Expose `fetchBlacklaceKnowledge()` — retourne la Bible Blacklace
- Mode mock : 5 entrées fictives mais représentatives
- Utilise Notion API v1, version 2022-06-28

---

## Logging

Pino avec pino-pretty en développement. Ne jamais utiliser `console.log`.

```typescript
// Dans les routes :
req.log.info({ agentId }, "Created agent");
req.log.error({ err }, "Failed to generate post");

// En dehors des routes :
import { logger } from "../lib/logger";
logger.info({ count }, "Generated month of posts");
```

---

## Flux de données — Génération d'un post

```
Frontend useGenerateSinglePost()
    → POST /api/generate/post { universe, agentId, platform }
    → Route fetch agent depuis DB
    → generatePostDraft(input) → mistral.ts
        → Si MISTRAL_API_KEY : appel API Mistral
        → Sinon : mock par agent (textes prédéfinis)
    → INSERT post en DB avec status='draft'
    → Return post enrichi (agentName, campaignName)
Frontend invalide getListPostsQueryKey()
    → Liste rafraîchie automatiquement
```

---

## Décisions architecturales

1. **PostgreSQL plutôt que SQLite** : Replit fournit PostgreSQL géré, plus robuste et directement migrable vers Supabase/Neon en production.

2. **OpenAPI-first** : La spec `openapi.yaml` est la source de vérité unique. Le codegen génère les types frontend et backend — zéro drift possible.

3. **Mode mock par défaut** : Chaque service externe (Mistral, Notion, Meta, etc.) a un fallback mock activé automatiquement si les clés sont absentes. L'application ne plante jamais.

4. **Settings singleton** : Une seule ligne dans la table `settings`. L'endpoint GET crée la ligne si elle n'existe pas (upsert implicite).

5. **Enrichissement posts** : Les routes posts enrichissent les données avec `agentName` et `campaignName` en faisant des JOINs ponctuels plutôt que des FK strictes — facilite la migration future vers Supabase.
