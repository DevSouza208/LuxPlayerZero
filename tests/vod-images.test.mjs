import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ensureVodSchema} from '../src/vod-schema.js';
import {queueImageMatch,processImageQueue,imageQueueStatus} from '../src/vod-images.js';
import {serveCachedArtwork} from '../src/artwork-route.js';
import {IMAGE_BUDGET,tmdbImageSource,imageBudgetAllows,imageKey} from '../src/vod-image-policy.js';

const JPEG=new Uint8Array([255,216,255,224,0,30,...Array(40).fill(1)]);
const fakeWebp=new Uint8Array([82,73,70,70,24,0,0,0,87,69,66,80,...Array(30).fill(0)]);
async function setup(){
 const sqlite=new DatabaseSync(':memory:');
 const prepare=(sql,params=[])=>({bind(...values){return prepare(sql,values)},
   async first(){return sqlite.prepare(sql).get(...params)||null},
   async all(){return{results:sqlite.prepare(sql).all(...params)}},
   async run(){const row=sqlite.prepare(sql).run(...params);return{meta:{changes:Number(row.changes)}}}
 });
 const files=new Map(),uploads=[],db={prepare};
 await ensureVodSchema(db);
 const env={DB:db,CATALOG_BUCKET:{
   async head(key){return files.has(key)?{size:files.get(key).byteLength}:null},
   async put(key,data,options){files.set(key,new Uint8Array(data));uploads.push({key,options})},
   async get(key){return files.has(key)?{body:new Blob([files.get(key)]).stream(),httpEtag:'"test"'}:null}
 }};
 return{sqlite,env,files,uploads};
}
test('Somente imagens de CDN TMDB oficial entram na fila; valores hostis rejeitados',()=>{
 assert.equal(tmdbImageSource('https://image.tmdb.org/t/p/w500/poster.jpg','poster'),'https://image.tmdb.org/t/p/w500/poster.jpg');
 assert.equal(tmdbImageSource('https://image.tmdb.org.evil.test/t/p/w500/x.jpg','poster'),null);
 assert.equal(tmdbImageSource('http://image.tmdb.org/t/p/w500/x.jpg','poster'),null);
 assert.equal(tmdbImageSource('https://image.tmdb.org/t/p/w1280/x.jpg','poster'),null);
 assert.equal(tmdbImageSource('https://image.tmdb.org/t/p/w500/x.jpg?token=private','poster'),null);
 assert.equal(imageKey('movie',438631,'poster'),'metadata/tmdb/movie/438631/poster.webp');
 assert.equal(imageKey('movie','../../secret','poster'),null);
 assert.equal(imageBudgetAllows({conversions:12000},{conversions:0}),false);
 assert.equal(imageBudgetAllows({bytes:IMAGE_BUDGET.maxBytesPerMonth-20},{conversions:0},21),false);
});
test('Filmes e series fazem fila, convertem sem Cloudflare Images e reutilizam R2',async()=>{
 const{env,sqlite,files,uploads}=await setup();
 const now=Date.parse('2026-11-04T02:00:00Z');
 const input={type:'movie',tmdbId:438631,poster:'https://image.tmdb.org/t/p/w500/poster.jpg',
  backdrop:'https://image.tmdb.org/t/p/w1280/backdrop.jpg',now};
 assert.equal(await queueImageMatch(env,input),2);
 assert.equal(await queueImageMatch(env,input),0,'Evita URLs repetidas');
 let requests=0,converts=0;
 const opts={now,limit:2,fetcher:async url=>{
  assert.match(url,/^https:\/\/image\.tmdb\.org\/t\/p\//);requests++;
  return new Response(JPEG,{headers:{'content-type':'image/jpeg'}});
 },convert:async()=>{converts++;return fakeWebp.buffer;}};
 const result=await processImageQueue(env,opts);
 assert.equal(result.converted,2);
 assert.equal(requests,2);assert.equal(converts,2);
 assert.equal(uploads.length,2);
 assert.ok(uploads.every(x=>x.options.httpMetadata.contentType==='image/webp'));
 assert.equal(files.size,2);
 assert.equal((await imageQueueStatus(env,now)).month.conversions,2);
 const again=await processImageQueue(env,{...opts,now:now+60000});
 assert.equal(again.converted,0);
 assert.equal(requests,2,'Imagem pronta nao deve ser baixada novamente');
 const route=await serveCachedArtwork(new Request('https://lux.example/api/artwork/movie/438631/poster'),env,{type:'movie',id:'438631',kind:'poster'});
 assert.equal(route.status,200);assert.equal(route.headers.get('content-type'),'image/webp');
 assert.equal((await route.arrayBuffer()).byteLength,fakeWebp.byteLength);
 sqlite.close();
});
test('Fallback de imagem usa so CDN segura e nunca consulta playlists',async()=>{
 const{env,sqlite}=await setup();
 const src='https://image.tmdb.org/t/p/w500/poster.jpg';
 let r=await serveCachedArtwork(new Request('https://lux.example/api/artwork/movie/438631/poster?src='+encodeURIComponent(src)),env,{type:'movie',id:'438631',kind:'poster'});
 assert.equal(r.status,302);assert.equal(r.headers.get('location'),src);
 r=await serveCachedArtwork(new Request('https://lux.example/api/artwork/movie/438631/poster?src=https://evil.example/x.jpg'),env,{type:'movie',id:'438631',kind:'poster'});
 assert.equal(r.status,404);
 r=await serveCachedArtwork(new Request('https://lux.example/api/artwork/movie/438631/poster',{method:'POST'}),env,{type:'movie',id:'438631',kind:'poster'});
 assert.equal(r.status,405);
 sqlite.close();
});
test('Cota propria pausa sem gastar mais bytes e retoma apos novo periodo',async()=>{
 const{env,sqlite}=await setup();
 const now=Date.parse('2026-11-04T02:00:00Z');
 await queueImageMatch(env,{type:'tv',tmdbId:111,poster:'https://image.tmdb.org/t/p/w500/show.jpg',now});
 sqlite.prepare('INSERT INTO vod_image_budget(period,conversions,bytes,processing_ms) VALUES (?,?,?,?)')
   .run('2026-11',IMAGE_BUDGET.maxImagesPerMonth,0,0);
 const r=await processImageQueue(env,{now,convert:()=>{throw Error('Nao deveria executar')}});
 assert.equal(r.paused,true);assert.equal(r.converted,0);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM vod_image_jobs WHERE status=?').get('pending').n,1);
 sqlite.close();
});
