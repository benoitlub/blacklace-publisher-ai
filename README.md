# Feuch Institute — Blacklace Publisher AI

Publisher Studio est en cours de pivot : il passe d'un assistant de rédaction/publication à un **Knowledge Observatory** pour Octopus Engine.

Sa nouvelle mission : observer des sources, extraire des connaissances structurées, les transformer en Knowledge Packs, puis les préparer pour Octopus Engine.

> **Règle produit** : Publisher observe. Octopus décide. Gérard jardine.

---

## Positionnement

### Octopus Engine

Octopus Engine reste le cerveau commun :

- planification ;
- orchestration ;
- coordination ;
- exécution contrôlée ;
- Guardian / Capabilities / EventBus.

Publisher ne doit pas réinventer Octopus Engine.

### Publisher Studio

Publisher devient les yeux et les oreilles :

- observatoire ;
- curateur ;
- laboratoire d'analyse ;
- producteur de connaissances ;
- interface de préparation des Seeds, Harvests et Knowledge Packs.

Publisher ne prend pas de décision métier finale. Il prépare des connaissances exploitables.

---

## Etat actuel

Production Render : opérationnelle.

Services attendus :

- `blacklace-publisher-web` : frontend statique ;
- `blacklace-publisher-api` : backend Node / Express ;
- `blacklace-publisher-db` : PostgreSQL.

Correctifs récents appliqués :

- `pnpm-workspace.yaml` autorise maintenant le build `octopus-engine` par nom de package ;
- `MISTRAL_API_KEY` active automatiquement le provider Mistral si `AI_PROVIDER` n'est pas explicitement défini ;
- si aucune clé IA n'est présente, le système reste en mode mock.

Voir aussi : `docs/REPO_STATUS_2026-07-08.md`.

---

## Pivot Observatory attendu

Le pivot cible le flux suivant :

```txt
Source
↓
Observation
↓
Extraction
↓
Knowledge
↓
Knowledge Pack
↓
Export Octopus mock
```

Sources prévues côté UI :

- URL ;
- dépôt GitHub ;
- texte ;
- Markdown ;
- PDF en placeholder.

Aucun vrai scraping, aucun LLM obligatoire, aucun connecteur externe nécessaire pour la première fondation.

---

## Ce qui doit rester séparé

Ne pas toucher à Octopus Engine depuis Publisher pour une simple évolution UI.

Ne pas modifier sans raison :

- Coordinator ;
- EventBus ;
- Guardian ;
- Capabilities ;
- runtime Octopus Engine.

Publisher produit des objets exportables. Octopus décide quoi en faire.

---

## Fonctionnalités historiques encore présentes

L'application conserve ses fonctions éditoriales existantes :

- agents éditoriaux ;
- missions client ;
- publications ;
- campagnes ;
- calendrier ;
- connecteurs ;
- mémoire / source de connaissance ;
- Garden Report ;
- Publisher Loop.

Ces éléments doivent être réinterprétés progressivement, pas dupliqués.

Exemples :

- une analyse terminée peut devenir un HarvestDraft ;
- une connaissance validée peut devenir un Seed ;
- un rapport peut devenir un Knowledge Report ;
- le Garden devient un jardin de connaissances.

---

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Frontend | React + Vite + TypeScript |
| Styling | Tailwind CSS v4 |
| Routing | Wouter |
| API client | TanStack Query + Orval |
| Backend | Express 5 + Node.js 24 |
| Base de données | PostgreSQL + Drizzle ORM |
| Validation | Zod + drizzle-zod |
| Logging | Pino |
| Monorepo | pnpm workspaces |

---

## Installation locale

```bash
git clone https://github.com/benoitlub/blacklace-publisher-ai
cd blacklace-publisher-ai

pnpm install
cp .env.example .env

pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/blacklace-publisher run dev
```

Frontend local :

```txt
http://localhost:3000
```

API locale :

```txt
http://localhost:5000/api
```

---

## Variables d'environnement

Voir `.env.example` pour la liste complète.

| Variable | Requis | Description |
|----------|--------|-------------|
| `DATABASE_URL` | Oui en prod | Connexion PostgreSQL |
| `MISTRAL_API_KEY` | Non | Active Mistral si `AI_PROVIDER` absent |
| `AI_PROVIDER` | Non | Force `mock`, `mistral`, `openai`, `anthropic`, `gemini`, `ollama`, `openrouter` ou `custom` |
| `AI_MODEL` | Non | Modèle à utiliser selon provider |
| `NOTION_API_KEY` | Non | Connecteur Notion si configuré |
| `NOTION_DATABASE_ID` | Non | Base Notion |
| `GITHUB_TOKEN` | Non | Prévu pour évolutions futures |
| `META_ACCESS_TOKEN` | Non | Prévu pour publication future |
| `TIKTOK_CLIENT_KEY` | Non | Prévu pour publication future |
| `KDP_ACCESS_KEY` | Non | Prévu pour reporting futur |

Sans clé externe, l'application doit rester utilisable en mode mock.

---

## Scripts utiles

```bash
# Typecheck complet
pnpm run typecheck

# Build complet
pnpm run build

# Regenerer les hooks API depuis OpenAPI
pnpm --filter @workspace/api-spec run codegen

# Pousser le schema DB en dev
pnpm --filter @workspace/db run push

# API
pnpm --filter @workspace/api-server run dev

# Frontend
pnpm --filter @workspace/blacklace-publisher run dev
```

---

## Architecture des dossiers

```txt
blacklace-publisher-ai/
├── artifacts/
│   ├── api-server/          # Backend Express
│   │   └── src/
│   │       ├── routes/
│   │       ├── services/
│   │       ├── ai/
│   │       └── lib/
│   └── blacklace-publisher/ # Frontend React + Vite
│       └── src/
│           ├── pages/
│           ├── components/
│           └── lib/
├── lib/
│   ├── api-spec/            # OpenAPI
│   ├── api-client-react/    # Hooks React Query générés
│   ├── api-zod/             # Schémas Zod générés
│   └── db/                  # Schéma Drizzle PostgreSQL
├── docs/
├── .env.example
├── pnpm-workspace.yaml
└── README.md
```

Le pivot Observatory ajoutera probablement, côté frontend, des dossiers du type :

```txt
src/observation/
src/knowledge/
src/extractors/
src/connectors/
src/export/
src/models/
src/services/
```

Seulement si aucun équivalent n'existe déjà.

---

## Pull requests et prudence

- Ne pas merger la PR `Sprint 2 lite — Generic knowledge engine foundation` avant le pivot Observatory.
- Elle contient des briques Knowledge intéressantes, mais peut créer une architecture parallèle si elle est fusionnée trop tôt.
- Le pivot doit d'abord rendre visible `/observatory` et le pipeline Source → Observation → Extraction → Knowledge → Knowledge Pack.

---

## Limites actuelles

- Pas de publication automatique réelle sur les réseaux sociaux.
- Meta API, TikTok API et KDP non intégrés.
- Pas d'authentification utilisateur.
- La génération reste mock si aucune clé IA n'est configurée.
- Le pivot Observatory n'est pas considéré complet tant que la route `/observatory` n'est pas visible en production.

---

## Pour Codex

Priorité immédiate : pousser le travail Observatory déjà annoncé, sans le recoder.

```md
Tu as implémenté le pivot Observatory mais il n'est pas visible sur GitHub ni sur Render.

Fais maintenant uniquement ceci :

1. Vérifie les fichiers modifiés/créés.
2. Commit tous les fichiers Observatory listés.
3. Push sur GitHub, branche `feature/knowledge-observatory-pivot`.
4. Ouvre une PR vers `main`.

Ne modifie rien d'autre.
Ne recode rien.
Ne refais pas le pivot.
Pousse simplement le travail déjà fait.
```

Voir aussi `docs/CODEX_HANDOFF.md` et `docs/REPO_STATUS_2026-07-08.md`.
