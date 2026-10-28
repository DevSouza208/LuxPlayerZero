import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/home.js',import.meta.url),'utf8'),start=source.indexOf('  async function metadataFor(item, {preload=false} = {}) {'),body=source.slice(start,source.indexOf('  const changedArtwork',start));
test('falha de pré-carregamento expira para detalhes sem repetir consultas de capa',async()=>{
 let clock=0,calls=0;const match={status:'matched',tmdbId:60572};
 const context=vm.createContext({queryFor:()=>({type:'tv',title:'Pokémon'}),metadataNeeded:()=>true,config:{imageEngine:'hybrid'},keyForQuery:()=> 'pokemon',tmdbResolved:new Map(),tmdbRetryAfter:new Map(),tmdbPending:new Map(),artworkMetadataCache:{get:async()=>null,put:async()=>{}},tmdbReadiness:null,tmdbConfigured:async()=>true,tmdbCalls:0,MAX_TMDB_CALLS:500,AbortController,setTimeout:()=>1,clearTimeout:()=>{},Date:{now:()=>clock},fetch:()=>{},requestTmdb:async()=>{calls++;return calls===1?null:match}});
 vm.runInContext(body,context);assert.equal(await context.metadataFor({}, {preload:true}),null);assert.equal(calls,1);
 await context.metadataFor({});assert.equal(calls,1);clock=30001;await context.metadataFor({}, {preload:true});assert.equal(calls,1);
 assert.equal((await context.metadataFor({})).tmdbId,60572);assert.equal(calls,2);await context.metadataFor({});assert.equal(calls,2);
});
