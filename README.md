# Feuch Institute — Blacklace Publisher AI

Publisher Studio est en cours de pivot : il passe d'un assistant de rédaction/publication à un **Knowledge Observatory** pour Octopus Engine.

Sa nouvelle mission : observer des sources, extraire des connaissances structurées, les transformer en Knowledge Packs, puis préparer les outils, coûts, connexions et routes utilisables par les applications.

> **Règle produit** : Publisher observe et prépare. Octopus exécute. Poulpe Fiction possède le Garden et Gérard jardine.

---

## Positionnement

### Octopus Engine

Octopus Engine reste le moteur commun et neutre :

- planification ;
- orchestration ;
- coordination ;
- exécution contrôlée ;
- Guardian / Capabilities / EventBus.

Publisher ne doit pas réinventer Octopus Engine.

### Publisher Studio

Publisher devient les yeux, les oreilles et le curateur technique :

- observatoire ;
- curateur ;
- laboratoire d'analyse ;
- producteur de connaissances ;
- Knowledge Packs ;
- Tool Packs ;
- Connection Broker ;
- coûts, crédits, limites et alternatives ;
- connexions aux providers externes.

Publisher ne possède pas le Garden métier, les parcelles ou Gérard. Ces concepts appartiennent à Poulpe Fiction.

### Local technique

L'espace anciennement présenté comme les connexions du « Garden » dans Publisher s'appelle désormais **Local technique**.

Il regroupe uniquement :

- clés et variables d'environnement ;
- OAuth et Composio ;
- providers ;
- connecteurs ;
- autorisations ;
- diagnostics et état d'infrastructure.

La route historique `/connectors` reste disponible pour compatibilité. L'entrée UI canonique devient `/local-technique`.

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
Knowledge Pack / Tool Pack
↓
Application consommatrice
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

Publisher produit des objets exportables et prépare des routes techniques. Poulpe Fiction conserve ses concepts de Garden, Seed, Sprout, parcelle et récolte.

---

## Fonctionnalités historiques encore présentes

L'application conserve ses fonctions éditoriales existantes :

- agents éditoriaux ;
- missions client ;
- publications ;
- campagnes ;
- calendrier ;
- Local technique / connecteurs ;
- mémoire / source de connaissance ;
- anciens rapports et boucles Publisher.

Ces éléments doivent être réinterprétés progressivement, pas dupliqués. Les anciens usages du vocabulaire Garden dans Publisher sont historiques et ne définissent plus une responsabilité métier.

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
pnpm run typecheck
pnpm run build
pnpm --filter @workspace/api-spec run codegen
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run dev
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

Ajouter de nouveaux dossiers seulement si aucun équivalent n'existe déjà.

---

## Limites actuelles

- Pas de publication automatique réelle sur les réseaux sociaux.
- Meta API, TikTok API et KDP non intégrés.
- Pas d'authentification utilisateur.
- La génération reste mock si aucune clé IA n'est configurée.
- Le pivot Observatory n'est pas considéré complet tant que la route `/observatory` n'est pas visible en production.

---

## Frontières canoniques

```txt
Poulpe Fiction possède le monde et le Garden.
Publisher connaît les ressources, les outils et les connexions.
Octopus Engine exécute sans connaître le monde.
```
