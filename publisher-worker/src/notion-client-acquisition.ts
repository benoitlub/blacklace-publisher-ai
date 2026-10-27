/** Explicit, read-only-source -> Notion review queue bridge. No outreach or PII collection. */
type Client = 'benoit-lubert' | 'yaebali';
type Inputs = { clientId: Client; organization: string; sourceUrl: string; evidence: string; observedAt?: string };
type Target = { databaseId: string; title: string };

const targets: Record<Client, { env: string; title: string }> = {
  'benoit-lubert': { env: 'NOTION_BENOIT_PROSPECTS_DATABASE_ID', title: 'Prospect / entreprise' },
  yaebali: { env: 'NOTION_YAEBALI_PROSPECTS_DATABASE_ID', title: 'Prospect' },
};

export function validateAcquisitionInput(raw: unknown): Inputs {
  if (!raw || typeof raw !== 'object') throw new Error('invalid-payload');
  const item = raw as Record<string, unknown>;
  if (item.clientId !== 'benoit-lubert' && item.clientId !== 'yaebali') throw new Error('client-not-allowed');
  const organization = String(item.organization || '').trim();
  const evidence = String(item.evidence || '').trim();
  if (!organization || organization.length > 160 || !evidence || evidence.length > 1200) throw new Error('missing-or-oversized-evidence');
  let url: URL;
  try { url = new URL(String(item.sourceUrl)); } catch { throw new Error('invalid-source-url'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)) throw new Error('invalid-source-url');
  if (item.observedAt && !/^\d{4}-\d\d-\d\d$/.test(String(item.observedAt))) throw new Error('invalid-date');
  return { clientId: item.clientId, organization, evidence, sourceUrl: url.href,
    observedAt: item.observedAt ? String(item.observedAt) : undefined };
}

function notionHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };
}

export async function writeAcquisitionReview(raw: unknown, env: Record<string, string | undefined>, fetcher: typeof fetch = fetch) {
  const item = validateAcquisitionInput(raw);
  const target = targets[item.clientId];
  const databaseId = env[target.env] || '';
  const apiKey = env.NOTION_API_KEY || '';
  if (!databaseId || !apiKey) return { status: 'not-configured' };
  const config: Target = { databaseId, title: target.title };
  const headers = notionHeaders(apiKey);
  const query = await fetcher(`https://api.notion.com/v1/databases/${config.databaseId}/query`, {
    method: 'POST', headers, body: JSON.stringify({ filter: { property: 'Lien source', url: { equals: item.sourceUrl } }, page_size: 1 }),
  });
  if (!query.ok) return { status: 'notion-query-failed', httpStatus: query.status };
  const existing = await query.json() as { results?: unknown[] };
  if (existing.results?.length) return { status: 'already-exists' }; // never overwrite reviewed or contacted data
  const richText = (content: string) => [{ text: { content } }];
  const response = await fetcher('https://api.notion.com/v1/pages', {
    method: 'POST', headers,
    body: JSON.stringify({ parent: { database_id: config.databaseId }, properties: {
      [config.title]: { title: richText(item.organization) },
      'Lien source': { url: item.sourceUrl },
      'Signal repéré': { rich_text: richText(item.evidence) },
      Source: { rich_text: richText('Publisher · recherche publique vérifiée') },
      'Résumé qualification': { rich_text: richText('À vérifier : aucune intention d’achat, aucun contact ou budget confirmé.') },
      ...(item.observedAt ? { 'Date signal': { date: { start: item.observedAt } } } : {}),
    } }),
  });
  if (!response.ok) return { status: 'notion-create-failed', httpStatus: response.status };
  const page = await response.json() as { id?: string; url?: string };
  return { status: 'created-for-review', pageId: page.id, url: page.url, clientId: item.clientId };
}
