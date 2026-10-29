import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './helpers/d1.mjs';
import {memoryStorage} from './helpers/local-memory.mjs';
import {ensureVodSchema} from '../src/vod-schema.js';
import {prepareHighlights,matchHighlight,dailyHighlightsApi,markHighlightsRefresh} from '../src/daily-highlights.js';
import {cleanHighlights,resolveHighlights,highlightDay} from '../public/daily-highlights-model.js';
import {createDailyHighlightsClient} from '../public/daily-highlights-client.js';
import {editorialApi} from '../src/editorial-api.js';
const NOW=Date.parse('2026-10-29T09:00:00Z'),ROOT='editorial/daily-highlights-v1/';
async function setup(){
 const DB=database();await ensureVodSchema(DB);DB.db.exec("CREATE TABLE catalog_sources(catalog_id TEXT,r2_key TEXT,synced_at TEXT)");DB.db.exec("INSERT INTO catalog_sources VALUES('source','snapshot','v1')");
 DB.db.prepare("INSERT INTO vod_catalog_jobs(catalog_id,generation,snapshot_key,snapshot_time,status,updated_at)VALUES('source','g1','snapshot','v1','ready',?)").run(NOW);
 const saved=new Map();const env={DB,TMDB_API_KEY:'test-key-not-real',CATALOG_BUCKET:{async get(key){const data=saved.get(key);return data?{json:async()=>structuredClone(data)}:null},async put(key,data){saved.set(key,JSON.parse(data))}}};
 function title(table,id,year=2026,tmdb=id,name='Título '+id){const key=name.toLowerCase()+'|'+year;DB.db.prepare(`INSERT INTO ${table}(id,titulo,titulo_normalizado,ano,tmdb_id,criado_em,atualizado_em) VALUES(?,?,?,?,?,?,?)`).run(key,name,name.toLowerCase(),year,tmdb,NOW,NOW);DB.db.prepare('INSERT INTO vod_catalog_items(catalog_id,tipo,item_id,generation) VALUES(?,?,?,?)').run('source',table,key,'g1');return key;}
 return {env,saved,title};
}
const candidate=(id,title='Título '+id)=>({id,title,name:title,release_date:'2026-01-01',first_air_date:'2026-01-01',poster_path:'/sample.jpg',backdrop_path:'/back.jpg',overview:'Descrição'});
const ranking=(ids,calls)=>async url=>{calls.push(String(url));return Response.json({results:ids.map(id=>candidate(id)),total_pages:1});};
const req=body=>new Request('https://lux.test/api/editorial/daily-highlights',{method:body?'POST':'GET',headers:{origin:'https://lux.test','content-type':'application/json'},body:body?JSON.stringify(body):undefined});
test('seleciona seis disponíveis por tipo na ordem do ranking, pula ausentes e reutiliza o dia sem rede',async()=>{
 const {env,title,saved}=await setup();for(let id=2;id<=8;id++){title('filmes',id);title('series',id);}const calls=[];
 const result=await prepareHighlights(env,{now:NOW,fetcher:ranking([1,2,3,4,5,6,7,8],calls)});
 assert.deepEqual(result.movies.map(row=>row.tmdbId),[2,3,4,5,6,7]);assert.equal(result.series.length,6);assert.equal(calls.length,2);assert.ok(calls[0].includes('/trending/movie/day'));assert.ok(calls[1].includes('/trending/tv/day'));assert.ok(!saved.has(ROOT+'published.json'));
 assert.equal((await prepareHighlights(env,{now:NOW,fetcher:()=>assert.fail('Não repetir rede')})).id,result.id);
});
test('fallback exige título e ano exatos, não contradiz ID existente, ignora vínculos antigos',async()=>{
 const {env,title}=await setup();title('filmes',1,2026,null,'Certo');title('filmes',2,2025,null,'Errado');title('filmes',3,2026,999,'Outro');title('filmes',4,2026,4,'Antigo');
 env.DB.db.prepare("UPDATE vod_catalog_items SET generation='antiga' WHERE item_id='antigo|2026'").run();
 assert.ok(await matchHighlight(env,'filmes',candidate(50,'Certo')));assert.equal(await matchHighlight(env,'filmes',candidate(51,'Errado')),null);assert.equal(await matchHighlight(env,'filmes',candidate(52,'Outro')),null);assert.equal(await matchHighlight(env,'filmes',candidate(4,'Antigo')),null);
});
test('rotina espera refresh diário e importação pronta, depois gera sem publicar',async()=>{
 const {env,title,saved}=await setup();let calls=0;const fetcher=async()=>{calls++;return Response.json({results:[candidate(1)]});};title('filmes',1);
 assert.equal(await prepareHighlights(env,{now:NOW,scheduled:true,fetcher}),null);assert.equal(calls,0);await markHighlightsRefresh(env,NOW);
 env.DB.db.exec("UPDATE vod_catalog_jobs SET status='building'");await assert.rejects(prepareHighlights(env,{now:NOW,scheduled:true,fetcher}),/Aguarde/);assert.equal(calls,0);
 env.DB.db.exec("UPDATE vod_catalog_jobs SET status='ready'");const draft=await prepareHighlights(env,{now:NOW,scheduled:true,fetcher});assert.equal(draft.movies.length,1);assert.equal(draft.series.length,0);assert.equal(calls,2);assert.ok(!saved.has(ROOT+'published.json'));
});
test('falha TMDB mantém publicação anterior e limita tentativas por uma hora',async()=>{
 const {env,title,saved}=await setup();title('filmes',1);saved.set(ROOT+'published.json',{id:'previous'});let calls=0;
 await assert.rejects(prepareHighlights(env,{now:NOW,fetcher:async()=>{calls++;return new Response('',{status:429})}}));
 await assert.rejects(prepareHighlights(env,{now:NOW+1000,fetcher:()=>assert.fail()}),/recentemente/);assert.equal(calls,1);assert.equal(saved.get(ROOT+'published.json').id,'previous');
});
test('rejeita troca de snapshot durante geração',async()=>{
 const {env,title,saved}=await setup();title('filmes',1);let calls=0;
 await assert.rejects(prepareHighlights(env,{now:NOW,fetcher:async()=>{calls++;if(calls===2)env.DB.db.exec("UPDATE catalog_sources SET synced_at='v2'");return Response.json({results:[candidate(1)]});}}),/Aguarde|mudou/);assert.ok(!saved.has(ROOT+'draft.json'));
});
test('paginação limitada a seis consultas, não publica uma seleção vazia',async()=>{
 const {env}=await setup();let calls=0;await assert.rejects(prepareHighlights(env,{now:NOW,fetcher:async()=>{calls++;return Response.json({results:[candidate(99)],total_pages:999});}}),/Nenhuma tendência/);assert.equal(calls,6);
});
test('publicação só admin, origem correta, confirmação da prévia do dia e presença atual',async()=>{
 const {env,title,saved}=await setup();title('filmes',1);const now=Date.now();const draft=await prepareHighlights(env,{now,fetcher:ranking([1],[])});
 assert.equal((await dailyHighlightsApi(req(),env,null)).status,401);assert.equal((await dailyHighlightsApi(req({action:'publish',id:draft.id}),env,{role:'member'})).status,403);
 const cross=req({action:'publish',id:draft.id});cross.headers.set('origin','https://other.test');assert.equal((await dailyHighlightsApi(cross,env,{role:'admin'})).status,403);
 assert.equal((await dailyHighlightsApi(req({action:'publish',id:'old-preview'}),env,{role:'admin'})).status,409);
 assert.equal((await dailyHighlightsApi(req({action:'publish',id:draft.id}),env,{role:'admin'})).status,200);
 const live=await (await dailyHighlightsApi(req(),env,{role:'member'})).json();assert.equal(live.selection.id,draft.id);assert.ok(live.selection.publishedAt);assert.ok(!JSON.stringify(live).includes('test-key'));
 env.DB.db.exec('DELETE FROM vod_catalog_items');assert.equal((await dailyHighlightsApi(req({action:'publish',id:draft.id}),env,{role:'admin'})).status,409);assert.equal(saved.get(ROOT+'published.json').id,draft.id);
});
test('rota exige sessão real antes de ler o R2',async()=>{const {env}=await setup();env.LUX_AUTH_PEPPER='test-only-pepper-more-than-32-characters';assert.equal((await editorialApi(req(),env)).status,401);});
test('frontend usa somente itens locais e conserva URL, objeto e variante original',()=>{
 const movie={id:'local',name:'Certo (2026)',group:'FILMES',url:'https://source.test/movie/private/original.mp4'};
 const selection=cleanHighlights({version:1,id:'draft',day:'2026-10-29',movies:[{catalogId:'certo|2026',tmdbId:1,title:'Certo',poster:'https://evil.test/a.jpg',url:'private'}],series:[]});
 const resolved=resolveHighlights(selection,{movies:[movie],series:[]});assert.equal(resolved.movies[0],movie);assert.equal(resolved.metadata.get(movie).poster,'');assert.equal(movie.url,'https://source.test/movie/private/original.mp4');assert.equal(resolveHighlights(selection,{movies:[],series:[]}).movies.length,0);assert.ok(!JSON.stringify(selection).includes('private'));
 assert.equal(highlightDay(Date.parse('2026-10-29T01:00:00Z')),'2026-10-28');
});
test('cache privado reutiliza seleção, mantém offline e atualiza ao publicar',async()=>{
 const store=memoryStorage(),seen=[],selection={version:1,id:'draft',day:'2026-10-29',movies:[],series:[]};let calls=0,time=1000;
 const make=()=>createDailyHighlightsClient({profileId:'a',store,now:()=>time,onChange:value=>seen.push(value),fetcher:async()=>{calls++;return Response.json({selection});}});
 const client=make();await Promise.all([client.load(),client.load()]);assert.equal(calls,1);await make().load();assert.equal(calls,1);
 const newer={...selection,id:'new'};await client.published(newer);assert.equal(seen.at(-1).id,'new');time+=3600001;
 const offline=createDailyHighlightsClient({profileId:'a',store,now:()=>time,onChange:value=>seen.push(value),fetcher:async()=>{throw Error('offline')}});assert.equal((await offline.load()).id,'new');
});
