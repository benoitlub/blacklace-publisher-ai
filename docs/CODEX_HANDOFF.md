# Codex Handoff — Feuch Institute Blacklace Publisher AI

**Auteur** : Replit Agent  
**Date** : Juin 2026  
**Version construite** : V1

---

## Ce qui a été fait (V1)

### Infrastructure
- [x] Monorepo pnpm avec workspaces TypeScript
- [x] Backend Express 5 + Node.js 24 avec Pino logging
- [x] PostgreSQL via Drizzle ORM (schéma, migrations, seed)
- [x] Frontend React 18 + Vite + TypeScript + Tailwind CSS v4
- [x] Contrat API OpenAPI 3.1 avec codegen automatique (Orval)
- [x] Hooks TanStack Query générés pour tout le frontend

### Pages et fonctionnalités
- [x] Dashboard avec stats temps réel et fil d'activité
- [x] Calendrier éditorial 30 jours avec génération de mois
- [x] CRUD complet : Posts, Agents, Campaigns
- [x] Page Connecteurs avec mode mock et test de connexion
- [x] Page Paramètres avec autonomyLevel, postsPerWeek, toggles
- [x] Sidebar de navigation permanente (7 entrées)

### Services
- [x] `services/mistral.ts` — génération avec fallback mock
- [x] `services/notion.ts` — Bible Blacklace avec fallback mock
- [x] 6 agents prédéfinis avec textes mock cohérents par agent

### Documentation
- [x] README.md complet
- [x] docs/PRD.md
- [x] docs/ARCHITECTURE.md
- [x] docs/AGENTS.md
- [x] docs/CODEX_HANDOFF.md
- [x] .env.example

---

## Ce qui reste à faire (V2+)

### Priorité haute
- [ ] **Meta Graph API** : Publication sur Instagram et Facebook
- [ ] **Authentification** : Login Benoît (Clerk ou Replit Auth)
- [ ] **Scheduling automatique** : Cron job pour publier les posts `scheduled` à l'heure prévue

### Priorité moyenne
- [ ] **TikTok Content Posting API** : Publication vidéo
- [ ] **KDP Reporting** : Import des stats de ventes Kindle
- [ ] **Mémoire éditoriale** : Historique des publications par univers pour éviter les répétitions
- [ ] **Export PDF** : Rapport mensuel éditorial en PDF

### Priorité basse
- [ ] **Multi-utilisateurs** : Rôles (admin, éditeur, lecteur)
- [ ] **Analytics** : Taux d'engagement par agent/plateforme
- [ ] **Webhooks** : Notification sur publication réussie/échouée

---

## Où sont les services Notion et Mistral

```
artifacts/api-server/src/services/
├── mistral.ts    — generatePostDraft(input: GeneratePostDraftInput): Promise<GeneratedDraft>
└── notion.ts     — fetchBlacklaceKnowledge(): Promise<BlacklaceKnowledgeItem[]>
```

Les deux services ont la même structure :
1. Lire la clé API depuis `process.env`
2. Si absente → retourner des données mock
3. Si présente → appel API réel avec try/catch → fallback mock si erreur

---

## Comment ajouter Meta API

1. **Installer le SDK** (optionnel, ou utiliser fetch direct) :
   ```bash
   pnpm --filter @workspace/api-server add facebook-nodejs-business-sdk
   ```

2. **Créer `services/meta.ts`** :
   ```typescript
   const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
   const META_IG_USER_ID = process.env.META_IG_USER_ID;
   
   export async function publishToInstagram(post: Post): Promise<{ success: boolean; postId?: string }> {
     if (!META_ACCESS_TOKEN || !META_IG_USER_ID) {
       logger.warn("Meta credentials not set — skipping publication");
       return { success: false };
     }
     // 1. POST /v18.0/{ig-user-id}/media (crée le media container)
     // 2. POST /v18.0/{ig-user-id}/media_publish (publie)
   }
   ```

3. **Brancher dans la route `generate.ts`** : après insertion du post, appeler `publishToInstagram` si `status === 'scheduled'` et `scheduledAt` est passé.

4. **Variables requises** : `META_ACCESS_TOKEN`, `META_PAGE_ID`, `META_IG_USER_ID`

---

## Comment ajouter TikTok API

1. **Créer `services/tiktok.ts`** avec l'API Content Posting v2 :
   ```typescript
   // POST https://open.tiktokapis.com/v2/post/publish/video/init/
   // Documentation: https://developers.tiktok.com/doc/content-posting-api-get-started
   ```

2. **Variables requises** : `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_ACCESS_TOKEN`

3. **Note** : TikTok requiert un flux OAuth 2.0 complet — implémenter l'authentification OAuth avant.

---

## Comment remplacer le mock par de vraies données

### Mistral (le plus simple)
```bash
# Ajouter la clé dans Replit Secrets
MISTRAL_API_KEY=votre-clé-ici
```
La fonction `generatePostDraft` utilisera automatiquement l'API réelle.

### Notion
```bash
NOTION_API_KEY=secret_xxxx
NOTION_DATABASE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
Assurez-vous que la base Notion contient les propriétés : `Name` (title), `Universe` (select), `Content` (rich_text), `Tags` (multi_select).

### Données de seed
Le fichier de seed initial est dans `artifacts/api-server/src/routes/seed.ts` (ou dans les migrations). Pour reseed :
```bash
# Depuis un script ou route d'administration
POST /api/admin/seed
```

---

## Commandes essentielles

```bash
# Installation
pnpm install

# DB schema push (après modification de lib/db/src/schema/)
pnpm --filter @workspace/db run push

# Regénérer les hooks API (après modification de lib/api-spec/openapi.yaml)
pnpm --filter @workspace/api-spec run codegen

# Typecheck complet
pnpm run typecheck

# Build complet
pnpm run build

# Développement local
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/blacklace-publisher run dev
```

---

## Points d'attention pour Codex

1. **Ne pas modifier les fichiers générés** dans `lib/api-client-react/src/generated/` ou `lib/api-zod/src/generated/`. Modifier `lib/api-spec/openapi.yaml` et relancer le codegen.

2. **Conventions de nommage des schémas OpenAPI** : utiliser des noms entity-shaped (`AgentInput`, `PostUpdate`), jamais operation-shaped (`CreateAgentBody`). Voir `lib/api-spec/openapi.yaml` pour les exemples.

3. **Logging** : toujours `req.log` dans les routes, `logger` dans les services. Jamais `console.log`.

4. **Enrichissement posts** : les routes posts font des JOINs ponctuels pour ajouter `agentName` et `campaignName`. En V2, envisager des vues matérialisées si les performances deviennent un problème.

5. **Settings singleton** : `GET /api/settings` crée la ligne si elle n'existe pas. Ne pas ajouter de gestion d'ID côté frontend.

6. **Mode mock transparent** : Chaque service doit toujours avoir un fallback mock. C'est une contrainte produit non négociable — l'application ne doit jamais planter sans clés API.
