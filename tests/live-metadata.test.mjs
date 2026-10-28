import test from 'node:test';import assert from 'node:assert/strict';
import {liveMetadata,liveMetadataStatus,createLiveMetadataCache} from '../src/live-metadata.js';
import {onRequestPost as pagesLookup} from '../functions/api/metadata/tmdb.js';
import {onRequestPost as pagesDetails} from '../functions/api/metadata/details.js';
import {onRequestGet as pagesStatus} from '../functions/api/metadata/status.js';
import worker from '../src/worker.js';
const origin='https://lux.example';
const request=(body,path='tmdb',site=origin)=>new Request(origin+'/api/metadata/'+path,{method:'POST',headers:{origin:site,'content-type':'application/json'},body:JSON.stringify(body)});
const poisoned=key=>({TMDB_API_KEY:key,get DB(){throw Error('D1 MUST NOT BE ACCESSED')}});
const pokemon={id:60572,name:'Pokémon',original_name:'ポケットモンスター',first_air_date:'1997-04-01',adult:false,poster_path:'/pokemon.jpg',genre_ids:[16]};
const season={id:99,name:'Liga Índigo',season_number:1,episodes:[{show_id:60572,season_number:1,episode_number:1,name:'Pokémon, Eu Escolho Você!',runtime:22}]};
test('lookup, detalhes e episódios funcionam sem ler nem escrever D1 e sem expor chave',async()=>{
 const env=poisoned('live-test-secret'),cache=createLiveMetadataCache();let calls=0;
 const fetcher=async(url,options)=>{calls++;const parsed=new URL(url);assert.equal(parsed.origin,'https://api.themoviedb.org');assert.equal(parsed.searchParams.get('language'),'pt-BR');assert.equal(options.redirect,'manual');if(parsed.pathname.includes('/season/'))return Response.json(season);return Response.json(parsed.pathname.includes('/search/')?{results:[pokemon]}:{...pokemon,seasons:[{season_number:1,name:'Liga Índigo'}]});};
 const lookup=()=>liveMetadata(request({type:'tv',title:'Pokémon'}),env,'lookup',{cache,fetcher});
 let response=await lookup();assert.equal(response.status,200);assert.equal((await response.json()).tmdbId,60572);assert.equal(calls,1);await lookup();assert.equal(calls,1);
 response=await liveMetadata(request({type:'tv',tmdbId:60572},'details'),env,'details',{cache,fetcher});assert.equal(response.status,200);assert.equal((await response.json()).seasons[0].name,'Liga Índigo');
 response=await liveMetadata(request({type:'tv',tmdbId:60572,seasonNumber:1},'details'),env,'details',{cache,fetcher});assert.equal(response.status,200);const text=await response.text();assert.ok(!text.includes(env.TMDB_API_KEY));assert.equal(JSON.parse(text).episodes[0].title,'Pokémon, Eu Escolho Você!');assert.equal(JSON.parse(text).name,'Liga Índigo');
 assert.equal((await liveMetadataStatus(env).json()).configured,true);
});
test('origem, métodos, chave e IDs inválidos são recusados antes de chamadas externas',async()=>{
 const env=poisoned('guard-test'),cache=createLiveMetadataCache();const fetcher=()=>{throw Error('NO REMOTE CALL')};
 assert.equal((await liveMetadata(request({title:'Pokémon',type:'tv'},'tmdb','https://other.example'),env,'lookup',{cache,fetcher})).status,403);
 assert.equal((await liveMetadata(new Request(origin+'/api/metadata/tmdb'),env,'lookup',{cache,fetcher})).status,405);
 assert.equal((await liveMetadata(request({type:'tv',tmdbId:'../users'},'details'),env,'details',{cache,fetcher})).status,400);
 assert.equal((await liveMetadata(request({type:'tv',title:'Pokémon'}),poisoned(''),'lookup',{cache,fetcher})).status,503);
 assert.equal((await liveMetadata(request({type:'tv',title:'X'.repeat(500)}),env,'lookup',{cache,fetcher})).status,413);
});
test('requisições concorrentes compartilham consulta e retornam respostas independentes',async()=>{
 const cache=createLiveMetadataCache(),env=poisoned('parallel');let calls=0,release;const gate=new Promise(resolve=>{release=resolve});
 const fetcher=async()=>{calls++;await gate;return Response.json({results:[pokemon]})};
 const a=liveMetadata(request({type:'tv',title:'Pokémon'}),env,'lookup',{cache,fetcher}),b=liveMetadata(request({type:'tv',title:'Pokémon'}),env,'lookup',{cache,fetcher});
 await new Promise(resolve=>setTimeout(resolve,10));release();const result=await Promise.all([a,b]);assert.equal(calls,1);for(const response of result)assert.equal((await response.json()).tmdbId,60572);
});
test('cache e limite são transitórios e falha da Cache API não derruba o TMDB',async()=>{
 let clock=0;const unavailable={match:async()=>{throw Error('Cache unavailable')},put:async()=>{throw Error('Cache unavailable')}};
 const cache=createLiveMetadataCache({clock:()=>clock,edgeCache:unavailable,maxEntries:1,burst:1,rate:1});
 await cache.put('a',{title:'A'},1000);assert.equal((await cache.get('a')).title,'A');await cache.put('b',{title:'B'},1000);assert.equal(await cache.get('a'),null);clock=1001;assert.equal(await cache.get('b'),null);
 assert.equal(cache.take(),true);assert.equal(cache.take(),false);clock+=1000;assert.equal(cache.take(),true);
 const response=await liveMetadata(request({type:'tv',title:'Pokémon'}),poisoned('cache-down'),'lookup',{cache:createLiveMetadataCache({edgeCache:unavailable}),fetcher:async()=>Response.json({results:[pokemon]})});assert.equal(response.status,200);
});
test('Cache API reutiliza resposta em outra instância com chave opaca e sem chave TMDB',async()=>{
 const saved=new Map(),edge={put:async(key,value)=>{assert.ok(!key.url.includes('private'));saved.set(key.url,value.clone())},match:async key=>saved.get(key.url)?.clone()};
 const first=createLiveMetadataCache({edgeCache:edge});await first.put('private-query-key',{title:'Liga Índigo'},Date.now()+60000,origin);const second=createLiveMetadataCache({edgeCache:edge});assert.equal((await second.get('private-query-key',origin)).title,'Liga Índigo');
});
test('rotas Pages e Worker usam o fluxo sem D1 inclusive com binding quebrado',async()=>{
 const oldFetch=globalThis.fetch;globalThis.fetch=async url=>Response.json(new URL(url).pathname.includes('/season/')?season:{results:[pokemon]});
 try{
  const env=poisoned('routes-live');assert.equal((await (await pagesStatus({env})).json()).configured,true);
  assert.equal((await pagesLookup({request:request({type:'tv',title:'Pokémon'}),env})).status,200);
  assert.equal((await pagesDetails({request:request({type:'tv',tmdbId:60572,seasonNumber:1},'details'),env})).status,200);
  assert.equal((await worker.fetch(new Request(origin+'/api/metadata/status'),env)).status,200);
  assert.equal((await worker.fetch(request({type:'tv',title:'Pokémon'}),env)).status,200);
  assert.equal((await worker.fetch(request({type:'tv',tmdbId:60572,seasonNumber:1},'details'),env)).status,200);
 }finally{globalThis.fetch=oldFetch;}
});
