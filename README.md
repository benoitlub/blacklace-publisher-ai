# Feuch Institute — Blacklace Publisher AI

Tableau de bord éditorial IA pour les univers Blacklace. Un assistant de community management qui libère Benoît de la charge éditoriale.

> **La règle produit** : Créer. Le reste est pris en charge.

---

## Description

Blacklace Publisher AI est une application web modulaire permettant de :
- Gérer des agents éditoriaux (Natasha, Marty, Feuch, Birdy, Clochette, Sofia)
- Planifier et approuver des publications sur Instagram, Facebook, TikTok, KDP, site web
- Organiser des campagnes éditoriales par univers
- Connecter Notion (base de connaissances) et Mistral AI (génération de contenu)
- Générer automatiquement un mois de contenu en mode mock ou via Mistral

---

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Frontend | React 18 + Vite + TypeScript |
| Styling | Tailwind CSS v4 |
| Routing | Wouter |
| API client | TanStack Query + Orval (codegen) |
| Backend | Express 5 + Node.js 24 |
| Base de données | PostgreSQL + Drizzle ORM |
| Validation | Zod v4 + drizzle-zod |
| Logging | Pino |
| Monorepo | pnpm workspaces |

---

## Installation locale

```bash
# 1. Cloner le repo
git clone https://github.com/feuch-institute/blacklace-publisher-ai
cd blacklace-publisher-ai

# 2. Installer les dépendances
pnpm install

# 3. Configurer les variables d'environnement
cp .env.example .env
# Éditer .env et compléter DATABASE_URL

# 4. Pousser le schéma de base de données
pnpm --filter @workspace/db run push

# 5. Lancer le serveur API
pnpm --filter @workspace/api-server run dev

# 6. Dans un autre terminal, lancer le frontend
pnpm --filter @workspace/blacklace-publisher run dev
```

L'application sera accessible sur http://localhost:3000 (frontend) et http://localhost:5000/api (backend).

---

## Variables d'environnement

Voir `.env.example` pour la liste complète. Les variables marquées comme optionnelles activent le mode mock si absentes — l'application ne plante jamais si une clé API manque.

| Variable | Requis | Description |
|----------|--------|-------------|
| `DATABASE_URL` | Oui (prod) | PostgreSQL connection string |
| `MISTRAL_API_KEY` | Non | Active la génération IA réelle |
| `NOTION_API_KEY` | Non | Synchronise la Bible Blacklace |
| `NOTION_DATABASE_ID` | Non | ID de la base Notion |
| `GITHUB_TOKEN` | Non | V2 — publication builds |
| `META_ACCESS_TOKEN` | Non | V2 — Meta Graph API |
| `TIKTOK_CLIENT_KEY` | Non | V2 — TikTok Content Posting API |
| `KDP_ACCESS_KEY` | Non | V2 — Amazon KDP reporting |

---

## Scripts disponibles

```bash
# Typecheck complet
pnpm run typecheck

# Build complet
pnpm run build

# Régénérer les hooks API depuis la spec OpenAPI
pnpm --filter @workspace/api-spec run codegen

# Pousser les changements de schéma DB (dev uniquement)
pnpm --filter @workspace/db run push

# Lancer le serveur API
pnpm --filter @workspace/api-server run dev

# Lancer le frontend
pnpm --filter @workspace/blacklace-publisher run dev
```

---

## Architecture des dossiers

```
blacklace-publisher-ai/
├── artifacts/
│   ├── api-server/          # Backend Express 5
│   │   └── src/
│   │       ├── routes/      # agents, posts, campaigns, connectors, settings, dashboard, calendar, generate
│   │       ├── services/    # mistral.ts, notion.ts
│   │       └── lib/         # logger.ts
│   └── blacklace-publisher/ # Frontend React + Vite
│       └── src/
│           ├── pages/       # Dashboard, Calendar, Posts, Campaigns, Agents, Connectors, Settings
│           └── components/  # UI partagés
├── lib/
│   ├── api-spec/            # openapi.yaml — source de vérité API
│   ├── api-client-react/    # Hooks React Query générés (Orval)
│   ├── api-zod/             # Schémas Zod générés (Orval)
│   └── db/                  # Schéma Drizzle PostgreSQL
├── docs/                    # Documentation complète
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── AGENTS.md
│   └── CODEX_HANDOFF.md
├── .env.example
├── pnpm-workspace.yaml
└── README.md
```

---

## Limites de la V1

- Pas de publication automatique réelle sur les réseaux sociaux
- Meta API, TikTok API et KDP non intégrés (structure préparée)
- Génération de contenu en mode mock si `MISTRAL_API_KEY` absent
- Synchronisation Notion en mode mock si clés absentes
- Pas d'authentification utilisateur (V2)
- Pas d'export ZIP intégré (utiliser `git archive`)

---

## Roadmap

### V2
- Intégration Meta Graph API (publication Instagram/Facebook)
- Intégration TikTok Content Posting API
- Authentification utilisateur (Clerk ou Replit Auth)
- Notifications email sur approvals
- Dashboard analytics avancé

### V3
- Publication automatique avec validation humaine optionnelle
- Mémoire éditoriale (historique des publications par univers)
- Synchronisation bidirectionnelle Notion
- Multi-utilisateurs / rôles
- Export PDF des rapports mensuels

---

## Pour Codex

Voir `docs/CODEX_HANDOFF.md` pour les instructions de reprise détaillées.
