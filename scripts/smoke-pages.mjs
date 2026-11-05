import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
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
    const content = await response.text();
    assert.ok(content.length > 0);
    assert.ok(!content.includes('hackerspaidegua.com'), `Unexpected custom domain in ${asset}`);
    if (asset.endsWith('.css')) {
      const urls = [...content.matchAll(/url\(["']?([^"')]+)["']?\)/g)];
      assert.ok(urls.length >= 2, 'Expected local font URLs in compiled CSS');
      for (const match of urls) {
        const url = match[1];
        if (url.startsWith('data:') || url.startsWith('#')) continue;
        assert.ok(url.startsWith(base + 'assets/'), `Font/image URL escaped the Pages subdirectory: ${url}`);
        const response = await fetch(host + url);
        assert.equal(response.status, 200, url);
        assert.ok((await response.arrayBuffer()).byteLength > 0);
      }
    }
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
    assert.equal(await response.text(), html, `Hash route must use the project-site entry: ${route}`);
  }
  for (const path of ['CNAME', 'public/CNAME', 'dist/CNAME']) {
    await assert.rejects(access(path), { code: 'ENOENT' }, `Custom-domain file must not exist: ${path}`);
  }
  console.log(`PASS: production HTML, ${assets.length} bundled assets, original mascot, local fonts and 4 hash routes under ${base}; no CNAME`);
} finally {
  server.kill('SIGTERM');
}
