import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGemCatalog, discoverAutonomousGemTools } from '../autonomous-gems.ts';

const gem = { id: 15, name: 'example/gem', url: 'https://github.com/example/gem', summary: 'Video generator', capabilities: ['video.generate'], score: 87, decision: 'candidate', execution: 'disabled', riskFlags: [] };
const pack = { contract: 'publisher-autonomous-gems-v1', executable: false, gems: [gem] };

test('passes a relevant gem as a non-executable candidate', () => {
  const tools = normalizeGemCatalog(pack, 'video');
  assert.equal(tools.length, 1);
  assert.equal(tools[0].executable, false);
  assert.equal(tools[0].authorizationRequired, true);
});

test('rejects unsafe and malformed catalogs and unrelated tools', () => {
  assert.deepEqual(normalizeGemCatalog({ ...pack, executable: true }, 'video'), []);
  assert.deepEqual(normalizeGemCatalog({ ...pack, gems: [{ ...gem, execution: 'enabled' }] }, 'video'), []);
  assert.deepEqual(normalizeGemCatalog({ ...pack, gems: [{ ...gem, riskFlags: ['license-review-required'] }] }, 'video'), []);
  assert.deepEqual(normalizeGemCatalog(pack, 'teleportation'), []);
});

test('network failures leave the existing tool discovery usable', async () => {
  const tools = await discoverAutonomousGemTools('video', async () => { throw new Error('offline'); });
  assert.deepEqual(tools, []);
});
