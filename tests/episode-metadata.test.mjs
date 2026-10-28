import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeSeason,detailMetadata} from '../src/detail-metadata.js';
import {database} from './helpers/d1.mjs';
import {createSeasonMetadataClient,episodePresentation,seasonPresentation} from '../public/episode-metadata.js';
const seasonData={id:900,season_number:1,episodes:[{id:100,show_id:42,season_number:1,episode_number:1,name:'Primeiro período',runtime:56,air_date:'2026-10-07',overview:'Começa um novo dia.',vote_average:7.3,vote_count:20,still_path:'/still.jpg'}]};
test('sanitiza a temporada e rejeita episódios de outra série ou temporada',()=>{
 const data=sanitizeSeason({...seasonData,episodes:[...seasonData.episodes,...seasonData.episodes,{...seasonData.episodes[0],episode_number:2,show_id:99},{...seasonData.episodes[0],episode_number:3,season_number:2}]},42,1);
 assert.equal(data.episodes.length,1);assert.equal(data.episodes[0].title,'Primeiro período');assert.equal(data.episodes[0].runtime,56);assert.equal(data.episodes[0].still,'https://image.tmdb.org/t/p/w780/still.jpg');
 assert.throws(()=>sanitizeSeason(seasonData,42,2));
 const absent=sanitizeSeason({id:900,season_number:0,episodes:[{season_number:0,episode_number:1,name:'Especial',runtime:-1,still_path:'https://evil.example/x',air_date:'invalid'}]},42,0).episodes[0];
 assert.equal(absent.runtime,null);assert.equal(absent.still,null);assert.equal(absent.airDate,null);
});
test('endpoint usa pt-BR, cache por temporada e valida origem e limites antes de consultar TMDB',async()=>{
 const env={DB:database(),TMDB_API_KEY:'test-season-key'};let calls=0;
 const fetcher=async(url,options)=>{calls++;const u=new URL(url);assert.equal(u.origin,'https://api.themoviedb.org');assert.equal(u.pathname,'/3/tv/42/season/1');assert.equal(u.searchParams.get('language'),'pt-BR');assert.equal(options.redirect,'manual');return Response.json(seasonData);};
 const call=(body,origin='https://lux.example')=>detailMetadata(new Request('https://lux.example/api/metadata/details',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}),env,fetcher);
 const body={tmdbId:42,type:'tv',seasonNumber:1};
 for(const bad of [{...body,type:'movie'},{...body,seasonNumber:'1'},{...body,seasonNumber:-1},{...body,seasonNumber:100},{...body,tmdbId:'../../bad'}])assert.equal((await call(bad)).status,400);
 assert.equal((await call(body,'https://other.example')).status,403);assert.equal(calls,0);
 const first=await call(body);assert.equal(first.status,200);assert.equal((await first.json()).episodes[0].runtime,56);
 const cached=await call(body);assert.equal(cached.status,200);assert.equal(calls,1);assert.ok(!(await cached.text()).includes(env.TMDB_API_KEY));
 assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM detail_metadata_cache').first()).n,1);
});
test('metadados só complementam os episódios presentes e não modificam a reprodução',()=>{
 const item=Object.freeze({id:'provider-123',url:'https://provider.example/episode/123.mp4'}),row=Object.freeze({item,season:1,number:1,title:''}),metadata=sanitizeSeason(seasonData,42,1);
 assert.deepEqual(episodePresentation(row,metadata),{title:'Primeiro período',info:'T1:E1 · 56 min · 07/10/2026 · ★ 7.3',overview:'Começa um novo dia.',still:'https://image.tmdb.org/t/p/w780/still.jpg'});
 assert.equal(row.item,item);assert.equal(item.url,'https://provider.example/episode/123.mp4');
 const missing={item,season:1,number:2,title:'Nome do fornecedor'};
 assert.deepEqual(episodePresentation(missing,metadata),{title:'Nome do fornecedor',info:'T1:E2',overview:'',still:null});
 assert.equal(episodePresentation({...missing,title:''},metadata).title,'Episódio 2');
});
test('cliente junta consultas simultâneas, separa temporadas e permite tentar de novo após falha',async()=>{
 let calls=0,clock=0,fail=false;
 const client=createSeasonMetadataClient({now:()=>clock,fetcher:async(url,options)=>{calls++;const body=JSON.parse(options.body);assert.deepEqual(Object.keys(body).sort(),['seasonNumber','tmdbId','type']);return fail?new Response('',{status:503}):Response.json({tmdbId:body.tmdbId,seasonNumber:body.seasonNumber,episodes:[]});}});
 const [a,b]=await Promise.all([client(42,1),client(42,1)]);assert.equal(a,b);assert.equal(calls,1);await client(42,1);assert.equal(calls,1);
 await client(42,2);assert.equal(calls,2);fail=true;assert.equal(await client(42,3),null);assert.equal(calls,3);await client(42,3);assert.equal(calls,3);
 fail=false;clock=30001;assert.ok(await client(42,3));assert.equal(calls,4);assert.equal(await client(42,-1),null);assert.equal(calls,4);
 const wrong=createSeasonMetadataClient({fetcher:async()=>Response.json({tmdbId:99,seasonNumber:1,episodes:[]})});assert.equal(await wrong(42,1),null);
});

test('nomes de temporada usam apenas o número correspondente e mantêm rótulo numérico acessível',()=>{
 const data={seasons:[{number:1,name:'Liga Índigo'},{number:2,name:'Aventuras nas Ilhas Laranja'},{number:25,name:'Jornadas Supremas'}]};const before=structuredClone(data);
 assert.deepEqual(seasonPresentation(1,data),{title:'Liga Índigo',caption:'Temporada 1',label:'Temporada 1 · Liga Índigo'});
 assert.equal(seasonPresentation(2,data).title,'Aventuras nas Ilhas Laranja');assert.equal(seasonPresentation(3,data).title,'Temporada 3');assert.equal(seasonPresentation(1,{seasonNumber:2,name:'Outra temporada'}).title,'Temporada 1');assert.equal(seasonPresentation(1,{seasonNumber:1,name:'Season 1'}).title,'Temporada 1');assert.deepEqual(data,before);
});
test('nome da temporada e nome do episódio são preservados pelo endpoint de apresentação',()=>{
 const data=sanitizeSeason({id:900,name:'Liga Índigo',season_number:1,episodes:[{show_id:60572,season_number:1,episode_number:1,name:'Pokémon, Eu Escolho Você!'}]},60572,1);
 assert.equal(data.name,'Liga Índigo');assert.equal(episodePresentation({season:1,number:1,title:''},data).title,'Pokémon, Eu Escolho Você!');assert.equal(episodePresentation({season:1,number:2,title:''},data).title,'Episódio 2');
});
