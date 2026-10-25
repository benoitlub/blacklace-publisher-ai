// Public catalog produced daily by Publisher's own GitHub Actions scout.
// It contains untrusted descriptions; this adapter never evaluates or installs code.
const CATALOG_URL = 'https://raw.githubusercontent.com/benoitlub/blacklace-publisher-ai/main/public/knowledge-packs/autonomous-github-gems.json';

export type GemTool = {
  id: string; name: string; role: string; reason: string; recipe: string;
  capabilities: string[]; url: string; confidence: number; source: string;
  decision: string; executable: false; authorizationRequired: true;
  validation: string[]; riskFlags: string[];
};

const KNOWN_CAPABILITIES = new Set(['video.generate', 'visual.generate', 'tool.search', 'knowledge.search']);

export function normalizeGemCatalog(payload: unknown, deliverable: string, limit = 5): GemTool[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  const catalog = payload as Record<string, unknown>;
  if (catalog.contract !== 'publisher-autonomous-gems-v1' || catalog.executable !== false || !Array.isArray(catalog.gems)) return [];
  const words = deliverable.toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 3);
  return catalog.gems.slice(0, 30).filter((gem: unknown) => gem && typeof gem === 'object' && !Array.isArray(gem)).map((raw: unknown) => {
    const gem = raw as Record<string, any>;
    const url = String(gem.url ?? '');
    if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/.test(url)) return null;
    const capabilities = Array.isArray(gem.capabilities) ? gem.capabilities.filter((cap: unknown): cap is string => typeof cap === 'string' && KNOWN_CAPABILITIES.has(cap)) : [];
    const riskFlags = Array.isArray(gem.riskFlags) ? gem.riskFlags.filter((flag: unknown): flag is string => typeof flag === 'string').slice(0, 10) : [];
    if (!capabilities.length || gem.execution !== 'disabled' || riskFlags.length || gem.decision !== 'candidate') return null;
    const name = String(gem.name ?? '').slice(0, 120);
    const reason = String(gem.summary ?? '').slice(0, 500);
    const relevance = words.length ? words.some(word => `${name} ${reason} ${capabilities.join(' ')}`.toLowerCase().includes(word)) : true;
    if (!relevance) return null;
    return {
      id: `gem:${String(gem.id).slice(0, 40)}`, name, role: 'integration-candidate', reason,
      recipe: 'Étudier les interfaces, adapter à un connecteur Publisher connu, puis valider licence, tests et permissions. Ne jamais exécuter le dépôt source directement.',
      capabilities, url, confidence: Math.min(0.95, Math.max(0.4, Number(gem.score || 0) / 100)),
      source: 'publisher-autonomous-github-scout', decision: 'candidate', executable: false as const,
      authorizationRequired: true as const,
      validation: ['license', 'source-review', 'unit-tests', 'sandbox-dry-run', 'authorization'], riskFlags,
    };
  }).filter((tool): tool is GemTool => tool !== null).slice(0, Math.max(0, Math.min(10, limit)));
}

export async function discoverAutonomousGemTools(deliverable: string, fetcher: typeof fetch = fetch): Promise<GemTool[]> {
  try {
    const response = await fetcher(CATALOG_URL, { signal: AbortSignal.timeout(3500), headers: { Accept: 'application/json' } });
    if (!response.ok) return [];
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > 300_000) return [];
    const body = await response.text();
    if (body.length > 300_000) return [];
    return normalizeGemCatalog(JSON.parse(body), deliverable);
  } catch { return []; }
}
