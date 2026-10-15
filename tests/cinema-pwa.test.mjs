import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../public/' + path, import.meta.url), 'utf8');

test('Lux Cinema PWA is installable from its own /cinema/ route', () => {
  const page = read('cinema/index.html');
  const manifest = JSON.parse(read('cinema/manifest.webmanifest'));
  assert.equal(manifest.start_url, '/cinema/');
  assert.equal(manifest.scope, '/cinema/');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some(icon => icon.src === '/assets/lux-icon.png'));
  assert.match(page, /rel="manifest" href="\/cinema\/manifest.webmanifest"/);
  assert.match(page, /apple-touch-icon/);
  assert.match(page, /src="\/cinema\/install.js"/);
});

test('Service worker is restricted to Cinema and only caches shell assets', () => {
  const install = read('cinema/install.js');
  const sw = read('cinema/sw.js');
  assert.match(install, /scope: '\/cinema\/'/);
  assert.match(install, /register\('\/cinema\/sw.js'/);
  assert.match(sw, /request\.method !== 'GET'/);
  assert.match(sw, /isPublicAsset\(url\)/);
  assert.doesNotMatch(sw, /['"]\/api\//);
  assert.doesNotMatch(sw, /\.m3u8?\b/);
  assert.doesNotMatch(sw, /['"]\/player['"]/);
});

test('Cinema keeps the stable M3U upload markup unchanged', () => {
  const original = read('player.html');
  const cinema = read('cinema/index.html');
  const segment = html => {
    const start = html.indexOf('<form id="source-form"');
    const end = html.indexOf('</form>', start);
    return html.slice(start, end + 7);
  };
  assert.equal(segment(cinema), segment(original));
});

test('All new visual admin controls are connected to their handlers', () => {
  const ui = read('home.js');
  const page = read('cinema/index.html');
  for (const name of ['heroMode','pinnedName','heroBackdrop','railOrder','density']) {
    assert.ok(page.includes('id="admin-' + name + '"'));
    assert.ok(ui.includes('config.' + name));
  }
  for (const name of ['showContinue','showFavorites','showTv','showMovies','showSeries','hideEmpty']) {
    assert.ok(page.includes('id="admin-' + name + '"'));
    assert.ok(ui.includes(name));
  }
  assert.match(ui, /detailsDialog/);
  assert.match(ui, /showDetails\(item\)/);
  assert.match(ui, /sourceDrawer/);
});
