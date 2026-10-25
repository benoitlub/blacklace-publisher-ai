import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Source discovery is deliberately read-only. A GitHub README is untrusted
// evidence, never an instruction for Publisher or an executable recipe.
export const SEARCHES = [
  'topic:agent-tools language:TypeScript',
  'topic:video-generation language:Python',
  'topic:open-source-automation language:TypeScript',
  'topic:3d-visualization language:JavaScript',
];
const PERMISSIVE = new Set(['mit', 'apache-2.0', 'bsd-3-clause', 'bsd-2-clause', 'isc']);
const BLOCKED = /(?:steal (?:tokens|passwords)|credential harvester|session hijack|malware|keylogger)/i;
const FEATURES = [
  { capability: 'video.generate', match: /\b(video|animation|reel|shorts|motion)\b/i, adapter: 'video' },
  { capability: 'visual.generate', match: /\b(image|design|visual|render|3d|mesh|texture)\b/i, adapter: 'visual' },
  { capability: 'tool.search', match: /\b(agent|tool|plugin|mcp|workflow|automation|integration)\b/i, adapter: 'tool-search' },
  { capability: 'knowledge.search', match: /\b(research|search|retrieval|knowledge|indexing)\b/i, adapter: 'knowledge' },
];

export function evaluateGem(repo, readme = '') {
  const description = String(repo.description ?? '').slice(0, 500);
  const evidence = `${repo.name ?? ''} ${description} ${String(readme).slice(0, 8000)}`;
  const license = String(repo.license?.spdx_id ?? 'UNKNOWN').toLowerCase();
  const capabilities = FEATURES.filter(f => f.match.test(evidence)).map(f => f.capability);
  const reasons = [];
  if (repo.archived || repo.disabled || repo.fork) reasons.push('inactive-or-fork');
  if (!PERMISSIVE.has(license)) reasons.push('license-review-required');
  if (BLOCKED.test(evidence)) reasons.push('suspicious-description');
  if (!capabilities.length) reasons.push('no-matching-capability');
  const freshnessDays = Math.max(0, (Date.now() - Date.parse(repo.pushed_at || 0)) / 86_400_000);
  const score = Math.min(100, Math.round(
    capabilities.length * 14 + Math.min(22, Math.log10(1 + Math.max(0, repo.stargazers_count || 0)) * 6)
    + (freshnessDays < 90 ? 18 : freshnessDays < 365 ? 7 : 0)
    + (PERMISSIVE.has(license) ? 12 : 0) - reasons.length * 15,
  ));
  return {
    id: String(repo.id), name: repo.full_name, url: repo.html_url, summary: description,
    stars: repo.stargazers_count ?? 0, updatedAt: repo.pushed_at ?? null,
    license: repo.license?.spdx_id ?? 'UNKNOWN', score, capabilities,
    riskFlags: reasons, decision: reasons.length ? 'needs-review' : 'candidate',
    execution: 'disabled',
    adaptation: {
      mode: 'pattern-first',
      recipe: capabilities.length ? `Étudier les interfaces ${capabilities.join(', ')} ; adapter uniquement aux connecteurs Publisher existants ; écrire des tests et vérifier les autorisations avant activation.` : 'Aucune capacité pertinente démontrée',
      validation: ['license', 'source-review', 'unit-tests', 'sandbox-dry-run', 'authorization'],
      autoInstall: false,
    },
    provenance: { provider: 'github-api', evidence: 'repository-metadata-and-readme', verifiedFunctionality: false },
  };
}

async function github(url, token) {
  const response = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'publisher-gem-scout',
      ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status} at ${new URL(url).pathname}`);
  return response.json();
}

export async function scout({ token = '', outFile = 'public/knowledge-packs/autonomous-github-gems.json', api = github } = {}) {
  const repos = new Map();
  for (const query of SEARCHES) {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=8`;
    const response = await api(url, token);
    for (const repo of response.items ?? []) if (repo?.full_name && !repos.has(repo.full_name)) repos.set(repo.full_name, repo);
  }
  const candidates = [];
  for (const repo of [...repos.values()].slice(0, 25)) {
    if (repo.archived || repo.disabled || repo.fork) continue;
    let readme = '';
    try {
      const response = await api(`https://api.github.com/repos/${repo.full_name}/readme`, token);
      if (response.encoding === 'base64' && typeof response.content === 'string')
        readme = Buffer.from(response.content, 'base64').toString('utf8').slice(0, 8000);
    } catch { /* Metadata is still a usable lead, not verified functionality. */ }
    const gem = evaluateGem(repo, readme);
    if (gem.score >= 35 && gem.capabilities.length) candidates.push(gem);
  }
  const gems = candidates.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 15);
  const pack = {
    version: 1, contract: 'publisher-autonomous-gems-v1', source: 'github-public-discovery',
    generatedDate: new Date().toISOString().slice(0, 10), executable: false,
    policy: 'discover-evaluate-adapt-test-before-execution', gems,
  };
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, `${JSON.stringify(pack, null, 2)}\n`);
  return pack;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  scout({ token: process.env.GITHUB_TOKEN ?? '' }).then(pack => {
    console.log(`Publisher scout: ${pack.gems.length} gems; execution remains disabled.`);
  }).catch(error => { console.error(error); process.exitCode = 1; });
}
