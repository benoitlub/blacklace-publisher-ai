/**
 * Base URL de l'API Publisher.
 *
 * La page est déployée en statique sur GitHub Pages : elle n'a pas de
 * backend à elle. `VITE_API_BASE_URL` est injecté au build par
 * .github/workflows/deploy-pages.yml et pointe sur le Worker Cloudflare,
 * seul backend réellement déployé (et seul à disposer de la connexion Neon).
 */
const OFFICIAL_API_BASE_URL = "https://blacklace-publisher-worker.benoitlubert.workers.dev";

export function apiUrl(path: string): string {
  const base = String(import.meta.env.VITE_API_BASE_URL || OFFICIAL_API_BASE_URL).trim().replace(/\/$/, "");
  return `${base.endsWith("/api") ? base : `${base}/api`}${path}`;
}
