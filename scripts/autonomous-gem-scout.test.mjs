import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGem, scout, WATCH_REPOSITORIES } from './autonomous-gem-scout.mjs';
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

test('recognizes free-model directories and voice tooling without believing pricing claims', () => {
  const directory = evaluateGem({ ...repo, name: 'awesome-free-llm-apis' }, 'List of free LLM APIs');
  assert.ok(directory.capabilities.includes('model.inference'));
  assert.equal(directory.costs.verified, false);
  const voice = evaluateGem({ ...repo, name: 'voice-studio' }, 'Open-source text-to-speech');
  assert.ok(voice.capabilities.includes('audio.synthesize'));
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

test('keeps a watched GitHub directory even when its score is low', async () => {
  const watchedName = WATCH_REPOSITORIES[0];
  const watchedRepo = { ...repo, id: 99, full_name: watchedName, name: 'awesome-free-llm-apis',
    license: null, stargazers_count: 0, pushed_at: '2020-01-01T00:00:00Z' };
  const pack = await scout({ outFile: path.join(await mkdtemp(path.join(tmpdir(), 'watched-gems-')), 'gems.json'),
    api: async url => url.endsWith('/readme')
      ? { encoding: 'base64', content: Buffer.from('Free LLM APIs').toString('base64') }
      : url.endsWith(watchedName) ? watchedRepo : { items: [] }, });
  assert.equal(pack.gems[0].name, watchedName);
  assert.equal(pack.gems[0].decision, 'needs-review');
  assert.equal(pack.gems[0].execution, 'disabled');
});
