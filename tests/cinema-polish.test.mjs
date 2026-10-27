import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = file => readFileSync(new URL('../public/' + file, import.meta.url), 'utf8');

test('Cinéma preserva player e formulário originais e usa estilo isolado', () => {
  const legacy = read('player.html'), cinema = read('cinema.html');
  for (const id of ['source-form','source-url','m3u-file','bridge-settings','connect','video','audio','channels']) {
    assert.ok(cinema.includes('id="' + id + '"'), 'Missing '+id);
  }
  assert.ok(legacy.includes('src="/app.js"'));
  assert.ok(!legacy.includes('cinema-polish.css'));
  assert.ok(cinema.includes('href="/cinema-polish.css"'));
  assert.ok(cinema.includes('src="/cinema-app.js"'));
});

test('Home não expande logos de canais no hero, nem toca no gateway', () => {
  const home = read('home.js'), cinema = read('cinema-app.js'), original = read('app.js');
  assert.ok(home.includes("heroArt.src = backdrop ||"));
  assert.ok(home.includes("'/assets/login-scene.png'"));
  assert.ok(!home.includes("artwork || '/assets/login-scene.png'"));
  for (const marker of ['bridge.snapshot(url','new window.Hls(', 'window.mpegts.createPlayer(', 'parseM3u(text, input)']) {
    assert.ok(original.includes(marker));
    assert.ok(cinema.includes(marker));
  }
});

test('Modal de detalhes usa logo separado e tem botao de assistir', () => {
  const home = read('home.js'), html = read('cinema.html');
  for (const id of ['details-dialog','details-poster','details-art','details-title','details-play','details-favorite']) {
    assert.ok(html.includes('id="' + id + '"'));
  }
  assert.ok(home.includes("detailPoster.src = logo"));
  assert.ok(home.includes("$('details-play')?.addEventListener"));
});

test('Modelos rápidos de admin não aplicam alterações antes de salvar', () => {
  const home = read('home.js'), html = read('cinema.html');
  for (const type of ['streaming','courses','generic']) {
    assert.ok(html.includes('data-admin-preset="' + type + '"'));
  }
  assert.ok(home.includes('presets[button.dataset.adminPreset]'));
  assert.ok(home.includes("field.value = value"));
  assert.ok(home.includes("await write('settings', {})"));
  assert.ok(!home.slice(home.indexOf("  const presets = {"), home.indexOf("  $('admin-reset')?.")).includes("write('settings'"));
});

test('Fonte Outfit e atribuição TMDB estão presentes sem credenciais embutidas', () => {
  const css=read('cinema-polish.css'), html=read('cinema.html');
  assert.ok(css.includes("font-family:'Outfit'"));
  assert.ok(html.includes('Este produto usa a API TMDB'));
  assert.ok(!html.includes('TMDB_API_KEY'));
  assert.ok(!css.includes('TMDB_API_KEY'));
});
