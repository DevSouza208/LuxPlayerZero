import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chooseExactMatch, chooseIdMatch, validateQuery, TMDB_LIMITS } from '../src/tmdb-safe.js';
import { lookupTmdb } from '../src/tmdb-metadata.js';
import { tmdbQueryForItem, metadataNeeded, chooseArtwork, catalogArtwork, requestTmdb } from '../public/tmdb-client.js';
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
  assert.equal(DEFAULT_SETTINGS.summaryEngine, 'tmdb');
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
  assert.equal(chooseExactMatch(movie('Odiseia',2026), [actor('Odisseia',2026,301)]),null);
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
  assert.ok(query.key.startsWith('v3:'), 'A nova versão não deve ler misses antigos do cache');
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

test('Pesquisa localizada remove artigo inicial sem consulta extra e valida o título completo', async () => {
  const db = fakeDB();
  let searches = 0;
  const result = await lookupTmdb(
    request({type:'movie',title:'A Odisseia',year:2026}),
    {DB:db,TMDB_API_KEY:'fake-test-key'},
    async url => {
      searches++;
      const parsed = new URL(url);
      assert.equal(parsed.searchParams.get('query'),'Odisseia');
      assert.equal(parsed.searchParams.get('language'),'pt-BR');
      return Response.json({results:[actor('Odisseia',2026,333)]});
    },
    () => Date.UTC(2026,9,17)
  );
  assert.equal(searches,1);
  assert.equal((await result.json()).tmdbId,333);
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

test('consulta de série remove S1 E1 antes de buscar a capa',()=>{
 assert.deepEqual(tmdbQueryForItem({name:'4 Blocks Zero S1 E1',group:'Séries'},'series'),{type:'tv',title:'4 Blocks Zero',year:null});
});


test('lookup funciona em Pages sem suporte ao campo cache do fetch',async()=>{
 const response=await lookupTmdb(request({type:'movie',title:'Duna',year:2021}),{DB:fakeDB(),TMDB_API_KEY:' key-with-whitespace '},async(url,options)=>{
  assert.equal(options.cache,undefined);assert.equal(options.redirect,'manual');
  assert.equal(new URL(url).searchParams.get('api_key'),'key-with-whitespace');
  return Response.json({results:[actor('Duna',2021,11)]});
 });
 assert.equal(response.status,200);assert.equal((await response.json()).status,'matched');
});

test('aceita pelo menos 96% sem ano, mas rejeita similaridade menor e sequência diferente',()=>{
 const title='Uma extraordinaria aventura pelo universo';
 const result=chooseExactMatch(movie(title,null),[actor('Uma extraordinaria aventura pelo universon',2024,900)]);
 assert.equal(result?.tmdbId,900);assert.ok(result.similarity>=96);
 assert.equal(chooseExactMatch(movie('Uma extraordinaria aventura pelo universo 2',null),[actor('Uma extraordinaria aventura pelo universo 3',2024,901)]),null);
});
test('busca inglesa e traduções verificadas recuperam alias e guardam a capa no D1',async()=>{
 const db=fakeDB(),env={DB:db,TMDB_API_KEY:'test-key'};const calls=[];
 const fetcher=async raw=>{
  const url=new URL(raw);calls.push(url.pathname+'?'+url.searchParams.get('language'));
  if(url.pathname.endsWith('/translations'))return Response.json({translations:[{iso_639_1:'pt',data:{title:'Pelados e Solitários'}}]});
  return Response.json({results:[actor('Naked and Afraid',2013,901)]});
 };
 const body={type:'movie',title:'Pelados e Solitários'};
 const first=await lookupTmdb(request(body),env,fetcher);assert.equal(first.status,200);
 const found=await first.json();assert.equal(found.status,'matched');assert.equal(found.tmdbId,901);assert.ok(found.poster);
 assert.equal(calls.length,3);assert.ok(calls[1].endsWith('en-US'));assert.equal(db.usage.values().next().value,3);
 const second=await lookupTmdb(request(body),env,()=>{throw Error('Cache must avoid remote search')});
 assert.equal((await second.json()).poster,found.poster);assert.equal(calls.length,3);
});
test('positivos antigos são reutilizados, negativos antigos são buscados novamente',async()=>{
 const db=fakeDB(),env={DB:db,TMDB_API_KEY:'test-key'},body={type:'movie',title:'Duna',year:2021};
 const query=validateQuery(body);const positive=chooseExactMatch(query,[actor('Duna',2021,11)]);
 db.cache.set(query.previousKey,{payload:JSON.stringify(positive),expires_at:Date.now()+100000});
 assert.equal((await (await lookupTmdb(request(body),env,()=>{throw Error('Must reuse positive')})).json()).tmdbId,11);
 db.cache.set(query.previousKey,{payload:JSON.stringify({status:'unmatched'}),expires_at:Date.now()+100000});
 let calls=0;const response=await lookupTmdb(request(body),env,async()=>{calls++;return Response.json({results:[actor('Duna',2021,11)]})});
 assert.equal((await response.json()).tmdbId,11);assert.equal(calls,1);
});

test('dublado é removido do título antes da identificação sem alterar a fonte',()=>{
 const item={name:'DUBLADO - Duna (2021) [DUB]',url:'http://source.example/movie/1',group:'FILMES'};
 const before=JSON.stringify(item),query=tmdbQueryForItem(item,'movies');
 assert.equal(query.title,'Duna');assert.equal(query.year,2021);assert.equal(JSON.stringify(item),before);
});

 test('novas importações limpam áudio e preservam as tags e a fonte',async()=>{
 const {presentationForEntry}=await import('../public/cinema-title.js');
 for(const audio of ['LEGENDADO','LEG','DUBLADO','DUB']){
  const source={name:`Duna (2021) - ${audio}`,url:'https://source.example/movie/1',group:'FILMES'};
  const original=JSON.stringify(source);
  const entry={...source,...presentationForEntry(source)};
  assert.equal(entry.displayName,'Duna');
  assert.equal(entry.catalogYear,2021);
  assert.ok(entry.catalogTags.includes(audio.startsWith('D')?'Dublado':'Legendado'));
  assert.equal(tmdbQueryForItem(entry,'movies').title,'Duna');
  assert.equal(JSON.stringify(source),original);
  assert.deepEqual(presentationForEntry(source),presentationForEntry(source));
 }
});

 test('apresentação aguarda TMDB e nunca usa imagem de episódio como capa da série',()=>{
 const provider='https://example.com/episode.jpg',poster='https://image.tmdb.org/t/p/w500/poster.jpg';
 assert.equal(catalogArtwork(provider,null,'tmdb','series'),'');
 assert.equal(catalogArtwork(provider,{status:'unmatched'},'tmdb','series'),'');
 assert.equal(catalogArtwork(provider,{status:'matched',poster},'tmdb','series'),poster);
 assert.equal(catalogArtwork(provider,null,'tmdb','movies'),'');
 assert.equal(catalogArtwork(provider,{status:'unmatched'},'tmdb','movies'),provider);
 assert.equal(catalogArtwork(provider,null,'tmdb','tv'),provider);
 assert.equal(catalogArtwork(provider,null,'playlist','series'),provider);
});
