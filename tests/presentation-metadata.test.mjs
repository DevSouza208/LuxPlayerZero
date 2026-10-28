import test from 'node:test';import assert from 'node:assert/strict';import {createPresentationMetadataClient} from '../public/presentation-metadata.js';
test('ficha e temporada são reutilizadas no navegador após criar um novo cliente',async()=>{
 const data=new Map(),localCache={get:async key=>data.get(key),put:async(key,value)=>{data.set(key,value)}};let calls=0,clock=0;
 const fetcher=async(_,options)=>{calls++;const q=JSON.parse(options.body);return Response.json({...q,...(q.seasonNumber===undefined?{title:'Pokémon'}:{name:'Liga Índigo',episodes:[{number:1,title:'Pokémon, Eu Escolho Você!'}]})})};
 let client=createPresentationMetadataClient({fetcher,localCache,now:()=>clock});
 const details={tmdbId:60572,type:'tv'},season={...details,seasonNumber:1};await Promise.all([client(details),client(details)]);await client(season);assert.equal(calls,2);
 client=createPresentationMetadataClient({fetcher,localCache,now:()=>clock});assert.equal((await client(details)).title,'Pokémon');assert.equal((await client(season)).name,'Liga Índigo');assert.equal(calls,2);
 clock=86400001;await client(season);assert.equal(calls,3);await client(details);assert.equal(calls,3);
});
test('cache local inválido ou desabilitado não impede consultar e falhas não viram sucesso persistente',async()=>{
 let calls=0,clock=0;const localCache={get:async()=>({expires:999999999,payload:{tmdbId:1,type:'tv'}}),put:async()=>{throw Error('Storage disabled')}};
 const client=createPresentationMetadataClient({localCache,now:()=>clock,fetcher:async()=>{calls++;return calls===1?new Response('',{status:503}):Response.json({tmdbId:60572,type:'tv'})}});
 assert.equal(await client({tmdbId:60572,type:'tv'}),null);assert.equal(calls,1);await client({tmdbId:60572,type:'tv'});assert.equal(calls,1);clock=30001;assert.equal((await client({tmdbId:60572,type:'tv'})).tmdbId,60572);assert.equal(calls,2);
 assert.equal(await client({tmdbId:60572,type:'movie',seasonNumber:1}),null);assert.equal(calls,2);
});
