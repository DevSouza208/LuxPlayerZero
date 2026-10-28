import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_SETTINGS, normalizeSettings, classifyItem, itemKey, safeImage, shouldResume, buildShowcase } from '../public/home-model.js';

const file = p => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');
const item = (name, group, url = 'https://example.org/video.ts', logo = '') =>
  ({ name, group, url, logo });

test('Cinema é uma página independente e não muda a importação do player funcional', () => {
  const original = file('player.html');
  const cinema = file('cinema.html');
  const form = html => html.slice(html.indexOf('<form id="source-form"'), html.indexOf('</form>', html.indexOf('<form id="source-form"')) + 7);
  assert.equal(form(cinema), form(original), 'O formulário da conexão precisa ser idêntico ao da produção.');
  assert.ok(original.includes('src="/app.js"'));
  assert.ok(!original.includes('src="/cinema-app.js"'));
  assert.ok(cinema.includes('src="/cinema-app.js"'));
  assert.ok(cinema.includes('href="/home.css"'));
  for (const id of ['source-url', 'm3u-file', 'bridge-settings', 'bridge-key',
    'connect', 'channels', 'video', 'audio', 'diagnostics', 'demo']) {
    assert.ok(cinema.includes('id="' + id + '"'), 'Faltando controle legado: ' + id);
  }
});

test('A nova interface mantém a rota do gateway e o mecanismo de reprodução', () => {
  const cinema = file('cinema-app.js');
  const original = file('app.js');
  for (const statement of ['createBridge(', 'bridge.snapshot(url',
    'new window.Hls(', 'window.mpegts.createPlayer(', 'setChannels(entries,']) {
    assert.ok(cinema.includes(statement), 'Ponto de integração ausente: ' + statement);
    assert.ok(original.includes(statement), 'Baseline indisponível: ' + statement);
  }
  assert.ok(cinema.includes('await prepareCatalog(text, input)'));
  assert.ok(file('catalog-prepare.js').includes('parseM3u(text,baseUrl)'));
  assert.ok(cinema.includes('homeCall(\'setItems\', channels)'));
  assert.ok(cinema.includes('homeCall(\'onPlaying\', selected)'));
  assert.ok(cinema.includes('try { home = createHome('));
  assert.ok(!original.includes('createHome('));
});

test('Hero e vitrines têm ganchos acessíveis e painel configurável', () => {
  const html = file('cinema.html');
  for (const id of ['hero-title', 'hero-play', 'hero-connect', 'hero-add', 'hero-poster',
    'home-rails', 'nav-movies', 'nav-series', 'admin-dialog', 'admin-form',
    'admin-moviesTitle', 'admin-tvKeywords', 'admin-seriesKeywords']) {
    assert.ok(html.includes('id="' + id + '"'), 'Elemento visual ausente: ' + id);
  }
});

test('Separa TV, filmes, séries, aulas e módulos e permite nomes próprios', () => {
  assert.equal(classifyItem(item('Globo', 'TV Abertos')), 'tv');
  assert.equal(classifyItem(item('Filme', 'Cinema 2026')), 'movies');
  assert.equal(classifyItem(item('Episódio', 'Séries Drama')), 'series');
  assert.equal(classifyItem(item('Aula', 'Cursos tecnologia')), 'movies');
  assert.equal(classifyItem(item('Lição', 'Módulo 2')), 'series');
  const custom = normalizeSettings({ moviesTitle: 'Cursos disponíveis', moviesKeywords: 'FORMAÇÃO, trilhas', seriesTitle: 'Aulas', seriesKeywords: 'videoaulas' });
  assert.equal(custom.moviesTitle, 'Cursos disponíveis');
  assert.equal(classifyItem(item('Curso', 'Trilhas de carreira'), custom), 'movies');
  assert.equal(classifyItem(item('Aula', 'Videoaulas Python'), custom), 'series');
});

test('Histórico e favoritos não guardam links ou senhas de stream', () => {
  const secretItem = item('Meu Curso', 'Formação', 'http://example.org/live/user/password/123.ts');
  const withoutSecret = { ...secretItem, url: 'https://domain.example/other.mp4' };
  assert.equal(itemKey(secretItem), itemKey(withoutSecret));
  assert.ok(!itemKey(secretItem).includes('password'));
  assert.equal(safeImage('javascript:alert(1)'), '');
  assert.equal(safeImage('http://example.org/a.png'), '');
  assert.equal(safeImage('https://example.org/a.png'), 'https://example.org/a.png');
});

test('Continuação de vídeos depende de duração e progresso válidos', () => {
  assert.equal(shouldResume(150, 300), true);
  assert.equal(shouldResume(0, 300), false);
  assert.equal(shouldResume(290, 300), false);
  assert.equal(shouldResume(150, Infinity), false);
});

test('Vitrines processam 260 mil entradas com até 16 cards por seção', () => {
  const items = Array.from({ length: 260000 }, (_, i) =>
    item('Entrada ' + i, i % 3 === 0 ? 'Filmes' : i % 3 === 1 ? 'Séries' : 'TV'));
  const key = itemKey(items[3]);
  const result = buildShowcase(items, DEFAULT_SETTINGS, [key]);
  assert.equal(result.counts.tv + result.counts.movies + result.counts.series, 260000);
  for (const rail of Object.values(result.rails)) assert.ok(rail.length <= 16);
  assert.equal(result.matches.get(key)?.name, 'Entrada 3');
});

 test('tipo Xtream prevalece sobre grupos ambíguos e regras da vitrine',()=>{
 const settings=normalizeSettings({moviesKeywords:'canais',seriesKeywords:'novelas'});
 for(const group of ['FILMES','NOVELAS','CANAIS COMPLETO(SD,HD,FHD,4K)','CANAIS INTERNACIONAIS']){
  const channel=item('Canal de novelas HD',group,'https://provider.example/live/test/test/100.m3u8');
  const before=JSON.stringify(channel);
  assert.equal(classifyItem(channel,settings),'tv');assert.equal(JSON.stringify(channel),before);
 }
 assert.equal(classifyItem(item('Filme','CANAIS','https://provider.example/movie/test/test/1.mp4'),settings),'movies');
 assert.equal(classifyItem(item('Episódio','FILMES','https://provider.example/series/test/test/2.mp4'),settings),'series');
 assert.equal(classifyItem(item('Filme','FILMES','https://live.example/movie/test/test/3.mp4')),'movies');
});
