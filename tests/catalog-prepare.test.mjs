import test from 'node:test';import assert from 'node:assert/strict';import {parseM3u} from '../public/playlist.js';import {presentationForEntry} from '../public/cinema-title.js';import {attachCinemaTmdbIds} from '../public/cinema-tmdb-tags.js';import {prepareCatalogText,createCatalogPreparer,isPreparedCatalog} from '../public/catalog-prepare.js';
const text='#EXTM3U\n#EXTINF:-1 tmdb-id="60572" group-title="Animes | Netflix",+ Pokémon S01E01\nhttps://example.com/series/u/p/1.mp4\n#EXTINF:-1 group-title="Filmes | Ação",+ Duna (2021) [Dublado]\nhttps://example.com/movie/u/p/2.mp4\n';
test('preparação preserva exatamente o parser apresentação e endereços existentes',()=>{
 const original=attachCinemaTmdbIds(text,parseM3u(text)),expected=original.map((item,i)=>({...item,id:'c'+i,...presentationForEntry(item)}));assert.deepEqual(prepareCatalogText(text),expected);assert.equal(expected[0].tmdbId,60572);assert.equal(expected[0].url,original[0].url);assert.equal(expected[1].name,original[1].name);
 const a=presentationForEntry(original[1]),b=presentationForEntry(original[1]);a.catalogGenreIds.push('changed');assert.ok(!b.catalogGenreIds.includes('changed'));
});
test('worker processa fora da chamada principal e resultado evita preparação duplicada',async()=>{
 let posts=0,terminated=0;
 class Worker{constructor(url,options){assert.ok(String(url).endsWith('/catalog-prepare-worker.js'));assert.equal(options.type,'module')}postMessage(data){posts++;queueMicrotask(()=>{this.onmessage({data:{id:999,items:[]}});this.onmessage({data:{id:data.id,items:prepareCatalogText(data.text,data.baseUrl)}})})}terminate(){terminated++}}
 const prepare=createCatalogPreparer({WorkerClass:Worker}),pending=prepare(text);assert.equal(posts,1);const entries=await pending;assert.equal(entries.length,2);assert.equal(isPreparedCatalog(entries),true);assert.equal(terminated,1);
});
test('navegador sem Worker ou bloqueio do worker mantém leitura e erros do parser',async()=>{
 const without=createCatalogPreparer({WorkerClass:null});assert.equal((await without(text)).length,2);await assert.rejects(without('invalid'),/playlist M3U/);
 class Blocked{constructor(){throw Error('Unsupported')}}
 assert.equal((await createCatalogPreparer({WorkerClass:Blocked})(text)).length,2);
});
