# Feuch Institute — Blacklace Publisher AI

Application web modulaire servant d'assistant éditorial IA pour les univers Blacklace. Libère Benoît de la charge de community management.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/blacklace-publisher run dev` — run the frontend (port auto)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 18 + Vite + Tailwind CSS v4 + Wouter
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — source de vérité de l'API
- `lib/db/src/schema/` — schéma Drizzle (agents, posts, campaigns, settings)
- `artifacts/api-server/src/routes/` — routes Express (agents, posts, campaigns, connectors, settings, dashboard, calendar, generate)
- `artifacts/api-server/src/services/` — mistral.ts, notion.ts
- `artifacts/blacklace-publisher/src/pages/` — pages React (Dashboard, Calendar, Posts, Campaigns, Agents, Connectors, Settings)
- `docs/` — PRD, ARCHITECTURE, AGENTS, CODEX_HANDOFF
- `.env.example` — toutes les variables d'environnement

## Architecture decisions

- PostgreSQL plutôt que SQLite : plus robuste et migrable vers Supabase/Neon
- OpenAPI-first : openapi.yaml est la source de vérité unique, les types sont générés
- Mode mock par défaut : tous les services externes ont un fallback si clé absente
- Settings singleton : une seule ligne dans la table settings (GET crée si absente)
- Enrichissement posts : agentName/campaignName ajoutés par les routes (pas de FK strictes)

## Product

- Dashboard avec stats éditoriales et fil d'activité
- 6 agents IA : Natasha, Marty, Feuch, Birdy, Clochette, Sofia
- Calendrier éditorial 30 jours avec génération de mois
- CRUD Posts / Campaigns / Agents
- Connecteurs Notion / Mistral / GitHub / Meta / TikTok / KDP (mode mock V1)
- Génération de contenu via Mistral AI (mock si clé absente)

## User preferences

- Interface en français
- Style sombre, ambiance laboratoire créatif / bureau d'enquête
- Pas d'emojis dans l'UI

## Gotchas

- Après modification de openapi.yaml → relancer `pnpm --filter @workspace/api-spec run codegen`
- Les fichiers dans `lib/api-client-react/src/generated/` et `lib/api-zod/src/generated/` sont générés, ne pas modifier manuellement
- Logging : toujours `req.log` dans les routes, `logger` dans les services — jamais `console.log`
- Settings : une seule ligne en DB, GET crée si absent (ne pas gérer l'ID côté frontend)

## Pointers

- Voir `docs/CODEX_HANDOFF.md` pour les instructions de reprise Codex
- Voir la `pnpm-workspace` skill pour la structure du workspace TypeScript
