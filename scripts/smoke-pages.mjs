import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
const host = 'http://127.0.0.1:4179';
const base = '/';
const domain = 'hackerspaidegua.com';
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
    const content = await response.text();
    assert.ok(content.length > 0);
    assert.ok(!content.includes('/Hackers_D-egua/'), `Stale repository prefix in ${asset}`);
  }
  for (const [file, magic] of [
    ['assets/brand/mascote-chapeu-transparente.png', '89504e470d0a1a0a'],
    ['assets/fonts/courier-prime-latin-400-normal.woff2', '774f4632'],
    ['assets/fonts/courier-prime-latin-700-normal.woff2', '774f4632'],
  ]) {
    const response = await fetch(host + base + file);
    assert.equal(response.status, 200, file);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.ok(bytes.toString('hex').startsWith(magic), `Missing original branding asset: ${file}`);
  }
  for (const route of ['#atividade/session-id', '#ranking', '#admin', '#admin/atividades/activity-id/resultados']) {
    const response = await fetch(host + base + route);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), html, `Hash route must use the static root entry: ${route}`);
  }
  assert.equal((await readFile('CNAME', 'utf8')).trim(), domain);
  assert.equal((await readFile('public/CNAME', 'utf8')).trim(), domain);
  assert.equal((await readFile('dist/CNAME', 'utf8')).trim(), domain);
  const cname = await fetch(host + '/CNAME');
  assert.equal(cname.status, 200);
  assert.equal((await cname.text()).trim(), domain);
  console.log(`PASS: production HTML, ${assets.length} bundled assets, original mascot, local fonts, CNAME and 4 hash routes at the custom-domain root ${base}`);
} finally {
  server.kill('SIGTERM');
}
