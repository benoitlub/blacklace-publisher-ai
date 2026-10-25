import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGem, scout } from './autonomous-gem-scout.mjs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repo = { id: 15, full_name: 'example/visual-tool', name: 'visual-tool', html_url: 'https://github.com/example/visual-tool', description: 'Open source image and video animation', license: { spdx_id: 'MIT' }, stargazers_count: 530, pushed_at: new Date().toISOString() };

test('evaluates a licensed relevant source without making it executable', () => {
  const gem = evaluateGem(repo, 'Video and image generator');
  assert.equal(gem.decision, 'candidate');
  assert.equal(gem.execution, 'disabled');
  assert.equal(gem.adaptation.autoInstall, false);
  assert.ok(gem.capabilities.includes('video.generate'));
});

test('unknown license or suspicious README blocks automatic promotion', () => {
  assert.equal(evaluateGem({ ...repo, license: null }, '').decision, 'needs-review');
  assert.equal(evaluateGem(repo, 'credential harvester').decision, 'needs-review');
});

test('scout deduplicates repositories and produces a non-executable catalog', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'gem-scout-test-'));
  const file = path.join(dir, 'gems.json');
  const pack = await scout({ outFile: file, api: async url => url.endsWith('/readme')
    ? { encoding: 'base64', content: Buffer.from('Image and video processing').toString('base64') }
    : { items: [repo, repo] } });
  assert.equal(pack.gems.length, 1);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).executable, false);
});
