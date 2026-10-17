import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chooseExactMatch, chooseIdMatch, validateQuery, TMDB_LIMITS } from '../src/tmdb-safe.js';
import { lookupTmdb } from '../src/tmdb-metadata.js';
import { tmdbQueryForItem, metadataNeeded, chooseArtwork, requestTmdb } from '../public/tmdb-client.js';
import { normalizeSettings, DEFAULT_SETTINGS } from '../public/home-model.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const actor = (title, year, id) => ({
  id, title, original_title: title, release_date: year + '-10-01',
  overview: 'Uma sinopse autorizada de teste.', poster_path: '/poster.jpg',
  backdrop_path: '/backdrop.jpg', vote_average: 7.5, genre_ids: [28, 18]
});
const movie = (title, year = null) => validateQuery({ type: 'movie', title, year });

test('TMDB é o padrão de imagens, sinopses continuam opcionais, e a M3U pode ser escolhida', () => {
  assert.equal(DEFAULT_SETTINGS.imageEngine, 'tmdb');
  assert.equal(DEFAULT_SETTINGS.summaryEngine, 'off');
  assert.deepEqual([normalizeSettings({ imageEngine: 'playlist' }).imageEngine,
    normalizeSettings({ summaryEngine: 'tmdb' }).summaryEngine], ['playlist','tmdb']);
  assert.equal(normalizeSettings({ imageEngine: 'javascript:wrong' }).imageEngine, 'tmdb');
  assert.equal(normalizeSettings({ summaryEngine: 'unknown' }).summaryEngine, 'off');
  assert.equal(metadataNeeded(DEFAULT_SETTINGS, 'details'), true);
  assert.equal(metadataNeeded(DEFAULT_SETTINGS, 'auto'), true);
  assert.equal(metadataNeeded(normalizeSettings({imageEngine:'playlist'}), 'auto'), false);
  for (const page of ['public/cinema/index.html', 'public/cinema.html']) {
    const html = read(page);
    assert.match(html, /id="admin-imageEngine"/);
    assert.match(html, /id="admin-summaryEngine"/);
    assert.match(html, /id="details-overview"/);
  }
});

test('Não envia cursos, canais e páginas genéricas para TMDB', () => {
  assert.equal(tmdbQueryForItem({name:'Aula 1',group:'Cursos de Python'}, 'movies'), null);
  assert.equal(tmdbQueryForItem({name:'Globo SP',group:'TV'}, 'tv'), null);
  assert.equal(tmdbQueryForItem({name:'Duna (2021) 4K',group:'Filmes'}, 'movies').year, 2021);
  assert.equal(tmdbQueryForItem({name:'Duna (2021) 4K',group:'Filmes'}, 'movies').title, 'Duna');
  assert.deepEqual(tmdbQueryForItem({name:'Dark S01E05',group:'Séries'}, 'series'),
    {type:'tv',title:'Dark',year:null});
});

test('Correspondência EXATA: não confunde filmes de mesmo nome em anos diferentes', () => {
  const candidates = [actor('Duna', 1984, 10), actor('Duna', 2021, 11)];
  assert.equal(chooseExactMatch(movie('Duna', null), candidates), null);
  assert.equal(chooseExactMatch(movie('Duna', 2021), candidates).year, 2021);
  assert.equal(chooseExactMatch(movie('Duna', 2020), candidates), null);
  assert.equal(chooseExactMatch(movie('Duna', 2021), [actor('Duna 2', 2021, 11)]), null);
  const result = chooseExactMatch(movie('Duna',2021), candidates);
  assert.equal(result.title, 'Duna');
  assert.ok(result.poster.startsWith('https://image.tmdb.org/t/p/'));
  assert.deepEqual(result.genres, ['Ação','Drama']);
});

test('Normaliza nomes M3U com prefixo +, artigos e pequenos erros sem perder o ano', () => {
  const query = tmdbQueryForItem({name:'+ A Odisseia (2026)',group:'FILMES',url:'https://private.example/video.m3u8'},'movies');
  assert.deepEqual(query,{type:'movie',title:'A Odisseia',year:2026});
  assert.equal(chooseExactMatch(movie('A Odisseia',2026), [actor('Odisseia',2026,301)])?.tmdbId,301);
  assert.equal(chooseExactMatch(movie('Odiseia',2026), [actor('Odisseia',2026,301)])?.tmdbId,301);
  assert.equal(chooseExactMatch(movie('Odiseia',2025), [actor('Odisseia',2026,301)]),null);
  assert.equal(chooseExactMatch(movie('Odiseia',null), [actor('Odisseia',2026,301)]),null);
});

test('Ano e ambiguidade protegem contra capas erradas', () => {
  assert.equal(chooseExactMatch(movie('Odisseia',2026),[actor('Odisseia',2025,1)]), null);
  assert.equal(chooseExactMatch(movie('Odisseia',2026),[actor('Odisseia',2026,1),actor('Odisseia',2026,2)]),null);
  assert.equal(chooseExactMatch(movie('Duna',2021),[actor('Duna 2',2021,3)]),null);
});

test('tmdb-id explícito permite nome traduzido, mas não ano divergente', () => {
  const query = validateQuery({type:'movie',title:'A Odisseia',year:2026,tmdbId:456});
  const details = actor('The Odyssey',2026,456);
  assert.equal(chooseIdMatch(query,details)?.tmdbId,456);
  assert.equal(chooseIdMatch(query,actor('The Odyssey',2025,456)),null);
  assert.equal(chooseIdMatch(query,actor('The Odyssey',2026,457)),null);
  assert.equal(validateQuery({type:'movie',title:'A Odisseia',tmdbId:'hack'}),null);
  assert.ok(query.key.startsWith('v2:'), 'A nova versão não deve ler misses antigos do cache');
  assert.equal(tmdbQueryForItem({name:'A Odisseia (2026)',group:'Filmes',tmdbId:456},'movies').tmdbId,456);
});

test('Busca diretamente por ID com um pedido remoto, e guarda D1 sem segredo', async () => {
  const db = fakeDB();
  let calls = 0;
  const fetcher = async url => {
    calls++;
    assert.match(url,/\/3\/movie\/456\?/);
    const { genre_ids, ...details } = actor('The Odyssey',2026,456);
    return Response.json({...details, genres:[{id:12}]});
  };
  const env = {DB:db,TMDB_API_KEY:'test-secret-only'};
  const result = await lookupTmdb(request({type:'movie',title:'A Odisseia',year:2026,tmdbId:456}),env,fetcher,()=>Date.UTC(2026,9,16));
  assert.equal(result.status,200);
  const payload = await result.json();
  assert.equal(payload.tmdbId,456);
  assert.deepEqual(payload.genres,['Aventura']);
  assert.equal(calls,1);
  assert.doesNotMatch(JSON.stringify(payload),/test-secret|api_key/);
});

test('Imagens M3U são fallback sempre; dados TMDB só com correspondência confirmada', () => {
  const original = 'https://source.example/image.jpg';
  assert.equal(chooseArtwork(original, null, 'tmdb'), original);
  assert.equal(chooseArtwork(original, {status:'unmatched'}, 'tmdb'), original);
  assert.equal(chooseArtwork(original, {status:'matched', poster:'https://image.tmdb.org/t/p/w500/poster.jpg'}, 'hybrid'),
    'https://image.tmdb.org/t/p/w500/poster.jpg');
  assert.equal(chooseArtwork(original, {status:'matched', poster:'https://image.tmdb.org/t/p/w500/poster.jpg'}, 'tmdb'),
    'https://image.tmdb.org/t/p/w500/poster.jpg');
  assert.equal(chooseArtwork(original, {status:'matched', poster:'https://image.tmdb.org/t/p/w500/poster.jpg'}, 'playlist'),
    original);
  assert.equal(chooseArtwork('', {status:'matched', poster:'https://image.tmdb.org/t/p/w500/poster.jpg'}, 'hybrid'),
    'https://image.tmdb.org/t/p/w500/poster.jpg');
});

function fakeDB() {
  const cache = new Map();
  const usage = new Map();
  return {
    cache, usage,
    prepare(sql) {
      return {
        async run() {
          if (!sql.startsWith('CREATE')) throw Error('unexpected raw run ' + sql);
          return { meta: { changes: 0 } };
        },
        bind(...args) {
          return {
            async first() {
              assert.match(sql, /SELECT payload/);
              return cache.get(args[0]) || null;
            },
            async run() {
              if (sql.startsWith('INSERT INTO tmdb_meta_daily')) {
                const [day, limit] = args;
                if ((usage.get(day) || 0) >= limit) return { meta: { changes: 0 } };
                usage.set(day, (usage.get(day) || 0) + 1);
                return { meta: { changes: 1 } };
              }
              if (sql.startsWith('INSERT INTO tmdb_meta_cache')) {
                cache.set(args[0], { payload: args[1], expires_at: args[2] });
                return { meta: { changes: 1 } };
              }
              throw Error('unexpected statement ' + sql);
            }
          };
        }
      };
    }
  };
}
const origin = 'https://lux.example';
function request(body) {
  return new Request(origin + '/api/metadata/tmdb', {
    method: 'POST', headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

test('Busca no servidor apenas uma vez, usa D1 na repetição e não expõe chave', async () => {
  const db = fakeDB();
  const env = { DB: db, TMDB_API_KEY: 'somente-chave-falsa-de-teste' };
  const date = Date.UTC(2026, 9, 15);
  let calls = 0;
  const fetcher = async url => {
    calls++;
    assert.match(url, /themoviedb.org\/3\/search\/movie/);
    assert.match(url, /language=pt-BR/);
    return Response.json({ results: [actor('Duna', 2021, 11), actor('Duna', 1984, 10)] });
  };
  const first = await lookupTmdb(request({title:'Duna',type:'movie',year:2021}), env, fetcher, () => date);
  assert.equal(first.status, 200);
  const value = await first.json();
  assert.equal(value.status, 'matched');
  assert.equal(value.year, 2021);
  assert.doesNotMatch(JSON.stringify(value), /falsa|api_key|username|password/);
  const second = await lookupTmdb(request({title:'Duna',type:'movie',year:2021}), env, fetcher, () => date);
  assert.equal(second.status, 200);
  assert.equal(calls, 1);
  assert.equal(db.usage.get('2026-10-15'), 1);
});

test('Sem D1/secret, com origem inválida ou limite diário: zero chamadas externas', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return Response.json({ results: [] }); };
  const db = fakeDB();
  const key = 'fake-key';
  assert.equal((await lookupTmdb(request({type:'movie',title:'Duna'}), {TMDB_API_KEY:key},fetcher)).status, 503);
  assert.equal((await lookupTmdb(request({type:'movie',title:'Duna'}), {DB:db},fetcher)).status, 503);
  const day = new Date().toISOString().slice(0,10);
  db.usage.set(day, TMDB_LIMITS.dailyRemoteLookups);
  const quota = await lookupTmdb(request({type:'movie',title:'Duna'}),{TMDB_API_KEY:key,DB:db},fetcher);
  assert.equal(quota.status, 429);
  assert.equal(calls,0);
});

test('O cliente só envia nome, ano e tipo; nunca manda URL de vídeo', async () => {
  const query = tmdbQueryForItem({name:'Duna (2021)',group:'Filmes',url:'http://private.example/get.php?password=secret'}, 'movies');
  const response = await requestTmdb(query, async (url, options) => {
    assert.equal(url, '/api/metadata/tmdb');
    assert.doesNotMatch(options.body, /private|password|secret/);
    assert.equal(options.method, 'POST');
    return Response.json({ status:'unmatched' });
  });
  assert.equal(response, null);
});

test('Apenas rota TMDB adicional, sem mexer em /api/bridge nem cache PWA de streams', () => {
  const routes = JSON.parse(read('public/_routes.json'));
  assert.ok(routes.include.includes('/api/bridge/*'));
  assert.ok(routes.include.includes('/api/metadata/*'));
  const sw = read('public/cinema/sw.js');
  assert.ok(sw.includes("'/tmdb-client.js'"));
  assert.doesNotMatch(sw, /['"]\/api\/metadata/);
  const app = read('public/cinema-app.js');
  assert.match(app, /homeCall\('setItems', channels\)/);
  const original = read('public/app.js');
  assert.doesNotMatch(original, /tmdb-client|TMDB_API_KEY/);
});
