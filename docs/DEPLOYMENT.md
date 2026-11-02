# Déploiement — Blacklace Publisher AI

## Les trois composants du dépôt

| Composant | Rôle | Déploiement décrit par le dépôt |
|---|---|---|
| `artifacts/blacklace-publisher` | Interface React et Knowledge Packs publics | GitHub Pages, workflow `deploy-pages.yml` |
| `publisher-worker` | API Cloudflare Worker utilisée par les diagnostics et le runtime | Cloudflare, workflow `deploy-publisher-worker.yml` |
| `artifacts/api-server` et PostgreSQL | API Express complète et services locaux | Développement local ; aucun hébergement permanent n'est attesté par ce guide |

Render est un ancien déploiement retiré. Il n'existe plus de blueprint
`render.yaml` dans la branche principale inspectée. Ne pas utiliser une ancienne
URL Render comme API active.

## Interface GitHub Pages

Le workflow `.github/workflows/deploy-pages.yml` construit le frontend avec :

- `BASE_PATH=/blacklace-publisher-ai/` ;
- `VITE_API_BASE_URL=https://blacklace-publisher-worker.benoitlubert.workers.dev`.

Il copie également `public/knowledge-packs/*.json` dans le site.
Le frontend attendu est
https://benoitlub.github.io/blacklace-publisher-ai/.

Pages héberge des fichiers statiques : il n'exécute ni Express ni PostgreSQL.
Le Worker n'est pas un remplacement intégral de l'API Express. En particulier,
le parcours OAuth `/connectors/composio/*` n'y a pas d'équivalent attesté par le
workflow Pages. Une page affichée ne prouve donc pas que toutes ses actions sont
opérationnelles.

## API Cloudflare Worker

La configuration canonique est `publisher-worker/wrangler.toml`. Le workflow
`.github/workflows/deploy-publisher-worker.yml` réalise le déploiement et impose
actuellement le typecheck avant celui-ci ; la suite complète de tests n'est pas
une dépendance de ce workflow.

L'URL configurée est :
https://blacklace-publisher-worker.benoitlubert.workers.dev.

Wrangler déclare notamment la liaison de service `OCTOPUS_ENGINE` vers le
service Cloudflare nommé `octopus-engine-app`. Ce nom de service ne permet pas,
à lui seul, de conclure que le dépôt GitHub homonyme est la source déployée :
vérifier le workflow du moteur avant de renommer un service ou un dépôt.

Les secrets et bindings doivent rester côté serveur. Consulter le fichier
Wrangler pour les bindings effectivement déclarés. Un binding déclaré ne prouve
pas qu'une connexion externe est autorisée ou disponible. Le cron autonome du
Worker est actuellement désactivé dans cette configuration (`crons = []) ;
ceci ne désactive pas le workflow Gérard dans Poulpe Fiction.

## Développement local avec Express

Depuis la racine du dépôt, avec Node 24 et pnpm :

```bash
pnpm install
cp .env.example .env
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/blacklace-publisher run dev
```

Configurer `DATABASE_URL` pour une base de développement avant la commande
`db push`. Ne pas utiliser cette synchronisation de schéma comme migration
implicite d'une base de production.

Les ports indiqués par le README sont 3000 pour le frontend et 5000 pour l'API.
Les clés externes sont facultatives pour les parcours qui prennent en charge le
mode mock ; les données simulées doivent conserver ce statut explicite.
Voir `.env.example` et le README pour la configuration locale.

## Vérifier une livraison

1. Vérifier les contrôles du commit exact et le résultat du déploiement concerné.
2. Vérifier la page ou la route réellement utilisée.
3. Distinguer connexion configurée, appel fournisseur réussi et capacité disponible.
4. Ne pas lancer une génération, un envoi ou une publication pour un simple test
   de disponibilité sans autorisation correspondante.

Ce guide décrit les fichiers et workflows du dépôt ; il ne certifie pas la
disponibilité instantanée des services ni l'état des secrets.
