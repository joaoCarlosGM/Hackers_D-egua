import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
const host = 'http://127.0.0.1:4179';
const base = '/Hackers_D-egua/';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4179', '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
server.stdout.on('data', chunk => { output += chunk; });
server.stderr.on('data', chunk => { output += chunk; });
try {
  let html;
  for (let i = 0; i < 50; i++) {
    if (server.exitCode !== null) throw new Error(output);
    try {
      const response = await fetch(host + base);
      if (response.ok) { html = await response.text(); break; }
    } catch { /* Wait for this server to bind. */ }
    await setTimeout(100);
  }
  assert.ok(html, 'Production server did not become ready');
  assert.match(html, /Hackers Pai D/);
  const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(match => match[1]);
  assert.ok(assets.some(asset => asset.endsWith('.js')) && assets.some(asset => asset.endsWith('.css')), 'Expected production JS and CSS');
  for (const asset of assets) {
    assert.ok(asset.startsWith(base + 'assets/'), `Wrong Pages path: ${asset}`);
    const response = await fetch(host + asset);
    assert.equal(response.status, 200, asset);
    assert.ok((await response.text()).length > 0);
  }
  const activityPage = await fetch(host + base + '#atividade/session-id');
  assert.equal(activityPage.status, 200);
  assert.equal(await activityPage.text(), html, 'Hash navigation must use the same static entry point');
  console.log(`PASS: production HTML, ${assets.length} bundled assets and hash activity link under ${base}`);
} finally {
  server.kill('SIGTERM');
}
