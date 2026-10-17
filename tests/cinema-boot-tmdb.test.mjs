import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_SETTINGS, normalizeSettings } from '../public/home-model.js';
import { chooseArtwork, metadataNeeded } from '../public/tmdb-client.js';
const file = p => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');

test('Splash aparece no primeiro paint e cobre a Home até terminar o restore', () => {
  const html = file('cinema.html'), js = file('cinema-app.js');
  assert.ok(html.includes('id="lux-boot"'));
  assert.ok(html.includes('Abrindo seu Lux Player...'));
  assert.ok(html.includes('.lux-boot{position:fixed;inset:0;z-index:9999'));
  assert.ok(html.indexOf('id="lux-boot"') < html.indexOf('class="shell cinema-shell"'));
  assert.ok(js.includes('await refreshBridgeStatus()'));
  assert.ok(js.includes('await restoreSavedLibrary()'));
  assert.ok(js.includes('finally {\n    // Somente mostra a Home após tentar a restauração'));
  assert.ok(js.includes('finishBoot();'));
  assert.ok(html.includes('id="lux-boot-skip"'));
  assert.ok(html.includes('}, 75000)'));
});

test('Quando TMDB está ligado ele tem prioridade, e M3U continua fallback', () => {
  const poster = 'https://image.tmdb.org/t/p/w500/poster.jpg';
  const playlist = 'https://test.example/m3u.png';
  const metadata = {status:'matched', poster};
  assert.equal(DEFAULT_SETTINGS.imageEngine,'tmdb');
  assert.equal(chooseArtwork(playlist, metadata, 'tmdb'), poster);
  assert.equal(chooseArtwork(playlist, metadata, 'hybrid'), poster);
  assert.equal(chooseArtwork(playlist, metadata, 'playlist'), playlist);
  assert.equal(chooseArtwork(playlist, null, 'tmdb'), playlist);
  assert.equal(metadataNeeded(normalizeSettings({imageEngine:'playlist'}), 'auto'), false);
});

test('Consultas TMDB apenas para títulos visíveis e com limite de concorrência', () => {
  const home = file('home.js');
  assert.ok(home.includes('const MAX_AUTO_ENRICH = 10;'));
  assert.ok(home.includes('const MAX_SIMULTANEOUS_TMDB = 3;'));
  assert.ok(home.includes('showcase.rails.movies.slice(0, 7)'));
  assert.ok(home.includes('seriesIndex.representatives.slice(0, 7)'));
  assert.ok(home.includes("if (art && needArt && data.backdrop) art.src = data.backdrop"));
  const html = file('cinema.html');
  assert.ok(html.includes('Apenas imagens M3U · TMDB desativado'));
  assert.ok(html.includes('TMDB primeiro · capas e banners (padrão)'));
});

test('A versão PWA instala o mesmo splash e mantém cache restrito ao shell', () => {
  const pwa = file('cinema/index.html'), sw = file('cinema/sw.js');
  assert.ok(pwa.includes('id="lux-boot"'));
  assert.ok(pwa.includes('Abrindo seu Lux Player...'));
  assert.ok(pwa.includes('TMDB primeiro · capas e banners (padrão)'));
  assert.ok(pwa.includes('src="/cinema/install.js"'));
  assert.ok(sw.includes("const VERSION = 'lux-cinema-shell-8'"));
  assert.ok(sw.includes("'/saved-catalog.js'"));
  assert.ok(sw.includes("'/cinema-tmdb-tags.js'"));
  assert.ok(!sw.includes("'/api/bridge/playlist'"));
});

test('Player original e sua importação não recebem loader ou integração extra', () => {
  const original = file('player.html');
  const app = file('app.js');
  assert.ok(!original.includes('id="lux-boot"'));
  assert.ok(!app.includes('finishBoot()'));
  assert.ok(!app.includes('tmdbQueued'));
});
