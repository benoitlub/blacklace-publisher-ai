import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./site-agent-audit.mjs', import.meta.url));
const exec = promisify(execFile);
const html = `<html lang="fr"><head><title>Une création officielle</title>
<meta name="description" content="Une description précise et assez longue pour présenter cette création officielle.">
<meta name="viewport" content="width=device-width"><link rel="canonical" href="https://example.org/">
<meta property="og:title" content="Création"><script type="application/ld+json">{}</script></head>
<body><nav><a href="/collection">Collection</a></nav><h1>Création</h1><img src="image.png" alt="Illustration"></body></html>`;

async function run(t, targets, { body = html, status = 200, type = 'text/html' } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'site-audit-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const fixture = path.join(dir, 'fetch.mjs'), calls = path.join(dir, 'calls.json');
  await writeFile(fixture, `import { writeFileSync } from 'node:fs';
    const calls = []; globalThis.fetch = async (url, options) => {
      if (options.redirect !== 'manual') throw Error('Redirects must stay disabled');
      calls.push(String(url)); writeFileSync(${JSON.stringify(calls)}, JSON.stringify(calls));
      return new Response(${JSON.stringify(body)}, { status: ${status}, headers: { 'content-type': ${JSON.stringify(type)} } });
    };`);
  const output = path.join(dir, 'report.json');
  await exec(process.execPath, ['--import', fixture, script, ...targets, '--out=' + output]);
  const bytes = await readFile(output, 'utf8');
  let requested = [];
  try { requested = JSON.parse(await readFile(calls, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  assert.ok(bytes.endsWith('\n'));
  return { report: JSON.parse(bytes), requested };
}

test('CLI parses HTML metadata and emits real JSON with no external requests', async t => {
  const { report, requested } = await run(t, ['https://example.org/']);
  assert.equal(report.autoPublish, false);
  assert.equal(report.autoFix, false);
  assert.deepEqual(requested, ['https://example.org/', 'https://example.org/robots.txt', 'https://example.org/sitemap.xml']);
  assert.equal(report.reports[0].score.passed, report.reports[0].score.total);
  assert.deepEqual(report.reports[0].linkSample, ['/collection']);
});

test('missing metadata remains review instead of being reported as present', async t => {
  const { report } = await run(t, ['https://example.org/'], { body: '<html><body><img src="x.png"></body></html>' });
  for (const id of ['title', 'lang', 'structured-data', 'navigation', 'links', 'image-alt'])
    assert.equal(report.reports[0].checks.find(c => c.id === id).status, 'review', id);
});

test('private, IP, credentialed and non-HTTPS targets are rejected before fetch', async t => {
  const targets = ['https://localhost/', 'https://sub.localhost/', 'https://host.local/',
    'https://host.internal/', 'https://127.0.0.1/', 'https://[::1]/', 'https://user:pass@example.org/', 'http://example.org/'];
  const { report, requested } = await run(t, targets);
  assert.deepEqual(requested, []);
  assert.ok(report.reports.every(r => r.error));
});

test('redirects and unsupported content do not trigger further fetches', async t => {
  for (const opts of [{ status: 302 }, { type: 'application/json' }]) {
    const { report, requested } = await run(t, ['https://example.org/'], opts);
    assert.equal(requested.length, 1);
    assert.equal(report.reports[0].checks[0].id, 'homepage-fetch');
    assert.equal(report.reports[0].checks[0].status, 'review');
  }
});
