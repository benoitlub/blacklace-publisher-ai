import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAcquisitionInput, writeAcquisitionReview } from '../notion-client-acquisition.ts';

const item = { clientId: 'benoit-lubert', organization: 'Boutique de jeux', sourceUrl: 'https://example.org/partners', evidence: 'Catalogue distributeur jeux' };
const env = { NOTION_API_KEY: 'test-notion-token', NOTION_BENOIT_PROSPECTS_DATABASE_ID: 'db-benoit', NOTION_YAEBALI_PROSPECTS_DATABASE_ID: 'db-yael' };

test('rejects unlisted clients and unsafe URLs', () => {
  assert.throws(() => validateAcquisitionInput({ ...item, clientId: 'unlisted' }), /client-not-allowed/);
  assert.throws(() => validateAcquisitionInput({ ...item, sourceUrl: 'http://localhost' }), /invalid-source-url/);
});

test('one client can only write to its fixed database, initially as research-only', async () => {
  const calls: { url: string; body: any }[] = [];
  const fake = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input); const body = JSON.parse(String(init?.body)); calls.push({ url, body });
    return new Response(JSON.stringify(url.endsWith('/query') ? { results: [] } : { id: 'new-page', url: 'https://notion.so/new-page' }), { status: 200 });
  };
  const result = await writeAcquisitionReview(item, env, fake as typeof fetch);
  assert.equal(result.status, 'created-for-review');
  assert.match(calls[0].url, /db-benoit/);
  assert.equal(calls[1].body.parent.database_id, 'db-benoit');
  assert.equal(calls[1].body.properties['Prospect / entreprise'].title[0].text.content, item.organization);
  assert.match(calls[1].body.properties['Résumé qualification'].rich_text[0].text.content, /aucun contact/);
});

test('existing source is not overwritten, or duplicated', async () => {
  let count = 0;
  const fake = async () => { count++; return new Response(JSON.stringify({ results: [{ id: 'existing' }] }), { status: 200 }); };
  assert.equal((await writeAcquisitionReview({ ...item, clientId: 'yaebali' }, env, fake as typeof fetch)).status, 'already-exists');
  assert.equal(count, 1);
});

test('missing client mapping blocks all remote requests', async () => {
  const result = await writeAcquisitionReview(item, { NOTION_API_KEY: 'token' }, async () => { throw new Error('should not call'); });
  assert.equal(result.status, 'not-configured');
});
