# Deployment — Feuch Institute / Blacklace Publisher AI

This project is a monorepo with two deployable parts:

- `@workspace/api-server` — Express API
- `@workspace/blacklace-publisher` — Vite/React frontend

GitHub is the source of truth. A hosting platform must build and run the app from GitHub.

---

## Recommended quick deployment: Render

A `render.yaml` blueprint is provided at the repository root.

It creates:

- `blacklace-publisher-api` — Node web service
- `blacklace-publisher-web` — static frontend
- `blacklace-publisher-db` — PostgreSQL database

### Steps

1. Go to Render.
2. Create a new Blueprint from the GitHub repository.
3. Select `benoitlub/blacklace-publisher-ai`.
4. Render reads `render.yaml`.
5. Deploy.

### Important variables

The blueprint starts in safe mock mode:

```env
AI_PROVIDER=mock
KNOWLEDGE_CONNECTOR=mock
```

This means the app can boot without external IA or knowledge API keys.

For real providers later, add variables such as:

```env
AI_PROVIDER=mistral
AI_MODEL=mistral-large-latest
MISTRAL_API_KEY=...

KNOWLEDGE_CONNECTOR=notion
NOTION_API_KEY=...
NOTION_DATABASE_ID=...
```

### Frontend to API link

The frontend reads:

```env
VITE_API_BASE_URL=https://blacklace-publisher-api.onrender.com
```

If Render gives the API another public URL, update this variable in the static web service.

---

## Local preview from GitHub

```bash
git clone https://github.com/benoitlub/blacklace-publisher-ai
cd blacklace-publisher-ai
pnpm install
cp .env.example .env
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/blacklace-publisher run dev
```

The frontend usually runs on port `3000` and the API on port `5000`.

---

## Deployment notes

- GitHub Pages is not enough for the full app because the project includes an Express API and PostgreSQL.
- The app must keep working without IA keys.
- Do not commit secrets.
- Do not deploy draft PRs to production unless explicitly needed.
- The first public deployment should use `main` once the deployment PR is merged.

---

## Next improvements

- Add a `/api/connectors/health` route that reports AI provider and knowledge connector status.
- Add production migrations instead of development schema push.
- Add CI checks for `pnpm run typecheck` and `pnpm run build`.
- Add a staging environment for PR previews.
