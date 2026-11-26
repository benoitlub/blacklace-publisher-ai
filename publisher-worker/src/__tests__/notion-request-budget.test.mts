import test from 'node:test';
import assert from 'node:assert/strict';
import { searchNotionWorkspaceKnowledge } from '../knowledge/notion-workspace-search.ts';

test('nested Notion blocks cannot exhaust the Worker request allowance', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let calls = 0;
  globalThis.fetch = async (input) => {
    calls++;
    const searching = String(input).endsWith('/search');
    return Response.json(searching ? {
      results: [{ object: 'page', id: 'source-page', properties: { Name: { type: 'title', title: [{ plain_text: 'Original source' }] } } }],
      has_more: false,
    } : {
      results: Array.from({ length: 20 }, (_, i) => ({ id: `child-${calls}-${i}`, type: 'paragraph', has_children: true,
        paragraph: { rich_text: [{ plain_text: 'A fact read from the source.' }] } })),
      has_more: true, next_cursor: `cursor-${calls}`,
    });
  };
  const items = await searchNotionWorkspaceKnowledge('test-key', 'Original source', 'terra');
  assert.equal(calls, 8);
  assert.equal(items.length, 1);
  assert.match(items[0].content, /A fact read from the source/);
  assert.equal(items[0].universe, '');
});

test('aliases and broad searches share one allowance without inventing a result', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ results: [], has_more: true, next_cursor: `cursor-${calls}` });
  };
  const budget = { remaining: 3 };
  assert.deepEqual(await searchNotionWorkspaceKnowledge('test-key', 'alias', 'terra', budget), []);
  assert.deepEqual(await searchNotionWorkspaceKnowledge('test-key', '', 'terra', budget), []);
  assert.equal(calls, 3);
  assert.equal(budget.remaining, 0);
});
