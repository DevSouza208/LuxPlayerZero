import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseM3u } from '../public/playlist.js';
import { DEFAULT_SETTINGS, normalizeSettings, classifyItem, itemKey, safeImage, shouldResume, buildShowcase } from '../public/home-model.js';

const item = (name, group, url = 'https://example.org/stream.ts', logo = '') =>
  ({ name, group, url, logo });

test('Home identifica TV, filmes, séries, cursos e módulos pelos grupos da playlist', () => {
  assert.equal(classifyItem(item('Globo', 'TV | Abertos')), 'tv');
  assert.equal(classifyItem(item('Filme A', 'Filmes 2026')), 'movies');
  assert.equal(classifyItem(item('Episódio 1', 'Séries | Drama')), 'series');
  assert.equal(classifyItem(item('Lição 1', 'Cursos de informática')), 'movies');
  assert.equal(classifyItem(item('Aula 2', 'Módulo 3')), 'series');
});

test('Admin pode renomear vitrines e associar grupos sem alterar a playlist', () => {
  const settings = normalizeSettings({
    moviesTitle: 'Cursos disponíveis',
    moviesKeywords: 'FORMAÇÃO, trilhas',
    seriesTitle: 'Aulas',
    seriesKeywords: 'videoaulas'
  });
  assert.equal(settings.moviesTitle, 'Cursos disponíveis');
  assert.equal(classifyItem(item('Curso A', 'Trilhas de carreira'), settings), 'movies');
  assert.equal(classifyItem(item('Aula A', 'Videoaulas Python'), settings), 'series');
  assert.equal(classifyItem(item('Globo', 'TV ao vivo'), settings), 'tv');
});

test('Nenhum identificador de histórico ou imagem aceita credenciais de URL', () => {
  const first = item('Meu curso', 'Formação', 'http://example.org:80/live/usuario/senha/100.ts');
  const second = { ...first, url: 'https://outro.exemplo/sem-credenciais' };
  assert.equal(itemKey(first), itemKey(second));
  assert.ok(!itemKey(first).includes('senha'));
  assert.equal(safeImage('javascript:alert(1)'), '');
  assert.equal(safeImage('http://example.org/poster.png'), '');
  assert.equal(safeImage('https://example.org/poster.png'), 'https://example.org/poster.png');
});

test('Continuar assistindo somente retoma vídeos com duração finita e progresso útil', () => {
  assert.equal(shouldResume(150, 300), true);
  assert.equal(shouldResume(0, 300), false);
  assert.equal(shouldResume(295, 300), false);
  assert.equal(shouldResume(150, Infinity), false);
});

test('Vitrines processam catálogo grande sem renderizar todas as entradas', () => {
  const entries = Array.from({ length: 25000 }, (_, i) => item('Título ' + i,
    i % 3 === 0 ? 'Filmes' : i % 3 === 1 ? 'Séries' : 'Canais'));
  const key = itemKey(entries[3]);
  const result = buildShowcase(entries, DEFAULT_SETTINGS, [key]);
  assert.equal(result.counts.movies + result.counts.series + result.counts.tv, entries.length);
  assert.ok(result.rails.movies.length <= 16);
  assert.ok(result.rails.series.length <= 16);
  assert.ok(result.rails.tv.length <= 16);
  assert.equal(result.matches.get(key)?.name, entries[3].name);
});

test('A nova Home mantém os ganchos do player e possui painel de personalização', () => {
  const html = readFileSync(new URL('../public/player.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  for (const id of ['home-rails', 'hero-title', 'hero-play', 'source-dialog', 'admin-dialog',
    'admin-form', 'admin-moviesTitle', 'admin-seriesTitle', 'admin-tvKeywords',
    'channels', 'video', 'audio', 'diagnostics', 'demo', 'source-form', 'bridge-settings']) {
    assert.ok(html.includes('id="' + id + '"'), 'Elemento ausente: ' + id);
  }
  assert.ok(js.includes('home.setItems(channels)'));
  assert.ok(js.includes('home.onPlaying(selected)'));
  assert.ok(js.includes('home.resumePosition(selected)'));
});

test('Lê títulos e grupos quando a M3U contém vírgulas dentro dos atributos', () => {
  const playlist = [
    '#EXTM3U',
    '#EXTINF:-1 tvg-name="HD,FHD,4K" group-title="TV, Brasil" tvg-logo="https://example.org/globo.png",Globo SP FHD',
    'https://example.org/live/globo.ts',
    "#EXTINF:-1 group-title='Cursos, Tecnologia' tvg-name='Aula 01',Introdução",
    'https://example.org/course/intro.mp4'
  ].join(String.fromCharCode(10));
  const parsed = parseM3u(playlist);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].name, 'Globo SP FHD');
  assert.equal(parsed[0].group, 'TV, Brasil');
  assert.equal(parsed[1].group, 'Cursos, Tecnologia');
  assert.equal(classifyItem(parsed[1]), 'movies');
});
