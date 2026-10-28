import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {uniqueVod,providerReference,readVodChunk} from '../src/vod-model.js';
import {parseM3u} from '../public/playlist.js';
import {startVodJobs,advanceVodJob,enrichVod,writeVodRows,runVodMaintenance} from '../src/vod-catalog.js';
import {ensureVodSchema} from '../src/vod-schema.js';
import {vodAdminApi} from '../src/vod-api.js';
import {accountApi} from '../src/account-api.js';
import {lookupTmdb} from '../src/tmdb-metadata.js';
const sample='#EXTM3U\n#EXTINF:-1 group-title="TV",Canal\nhttps://source.test/live/u/p/1.m3u8\n#EXTINF:-1 group-title="FILMES",Duna (2021) Dublado\nhttps://source.test/movie/u/p/101.mp4\n#EXTINF:-1 group-title="FILMES",Duna (2021) Legendado\nhttps://source.test/movie/u/p/102.mp4\n#EXTINF:-1 group-title="SÉRIES",Uma Série (2020) S01E01\nhttps://source.test/series/u/p/201.mp4\n#EXTINF:-1 group-title="SÉRIES",Uma Série (2020) S01E02\nhttps://source.test/series/u/p/202.mp4\n';
function setup(text=sample){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../migrations/0001_catalog_sources.sql',import.meta.url),'utf8'));
 const bytes=new TextEncoder().encode(text),count=parseM3u(text).length;
 db.prepare('INSERT INTO catalog_sources VALUES (?,?,?,?,?,?)').run('source','catalog','snapshot','v1',count,bytes.length);
 const prepare=(sql,params=[])=>({bind(...values){return prepare(sql,values)},async first(){return db.prepare(sql).get(...params)||null},async all(){return {results:db.prepare(sql).all(...params)}},async run(){const meta=db.prepare(sql).run(...params);return {meta:{...meta,changes:Number(meta.changes)}}}});
 const env={DB:{prepare,async batch(statements){db.exec('BEGIN');try{const results=[];for(const q of statements)results.push(await q.run());db.exec('COMMIT');return results}catch(error){db.exec('ROLLBACK');throw error}}},CATALOG_BUCKET:{async get(key,{range}){const part=bytes.subarray(range.offset,range.offset+range.length);return {arrayBuffer:async()=>part.buffer.slice(part.byteOffset,part.byteOffset+part.byteLength)}}}};
 return {env,db,bytes};
}
test('duas tabelas recebem títulos únicos, IDs reais e nenhuma linha de episódio/TV',async()=>{
 const {env,db}=setup();const original=sample;await startVodJobs(env,100);const result=await advanceVodJob(env,{now:101});assert.equal(result.status,'ready');assert.equal(result.count,5);
 const filmes=db.prepare('SELECT * FROM filmes').all(),series=db.prepare('SELECT * FROM series').all();assert.equal(filmes.length,1);assert.equal(series.length,1);assert.equal(filmes[0].titulo,'Duna');assert.equal(series[0].titulo,'Uma Série');assert.equal(series[0].id_provedor,null);assert.equal(series[0].ano,2020);
 const variants=JSON.parse(db.prepare("SELECT ids_provedor FROM vod_catalog_items WHERE tipo='filmes'").get().ids_provedor);assert.deepEqual(variants.map(x=>x.id_provedor).sort(),['101','102']);assert.equal(sample,original);
 assert.ok(!JSON.stringify([...filmes,...series]).includes('/u/p/'));assert.ok(!JSON.stringify(series).includes('S01E'));
});
test('normaliza antes de classificar e nunca confunde UUID/ID de episódio com ID da série',()=>{
 const values=uniqueVod(parseM3u(sample));assert.equal(values.filmes.length,1);assert.equal(values.series.length,1);
 assert.equal(providerReference({url:'https://a.test/movie/u/p/12345678-abcd-1234-abcd-123456789abc.mp4'},'movies').id_provedor,'12345678-abcd-1234-abcd-123456789abc');
 assert.equal(providerReference({url:'https://a.test/series/u/p/123.mp4'},'series').id_provedor,null);
 assert.equal(providerReference({url:'https://a.test/series/u/p/123.mp4',seriesId:'77'},'series').id_provedor,'77');
});
test('chunk interrompido em UTF-8 e EXTINF preserva todas as entradas',()=>{
 const bytes=new TextEncoder().encode(sample);let cursor=0,group='',count=0;const titles=[];
 while(cursor<bytes.length){const part=bytes.subarray(cursor,Math.min(bytes.length,cursor+220)),parsed=readVodChunk(part,{group,final:cursor+part.length===bytes.length});assert.ok(parsed.consumed>0);cursor+=parsed.consumed;group=parsed.group;count+=parsed.count;titles.push(...parsed.filmes,...parsed.series)}
 assert.equal(count,5);assert.ok(titles.some(x=>x.titulo==='Uma Série'));assert.equal(cursor,bytes.length);
});
test('atualização é idempotente e preserva edições e classificação manual',async()=>{
 const {env,db}=setup();await startVodJobs(env,100);await advanceVodJob(env,{now:101});
 db.prepare("UPDATE filmes SET titulo='Duna editado',generos='[\"Aventura\"]',tags='[\"Família\"]',colecoes='[\"Favoritos\"]',tmdb_id=438631,status_metadados='manual'").run();
 await startVodJobs(env,102);assert.equal((await advanceVodJob(env,{now:103})).status,'idle');
 db.prepare("UPDATE catalog_sources SET synced_at='v2'").run();await startVodJobs(env,104);await advanceVodJob(env,{now:105});
 const row=db.prepare('SELECT * FROM filmes').get();assert.equal(row.titulo,'Duna editado');assert.equal(row.tags,'["Família"]');assert.equal(row.generos,'["Aventura"]');assert.equal(row.tmdb_id,438631);assert.equal(db.prepare('SELECT COUNT(*) n FROM filmes').get().n,1);
});
test('snapshot troca durante leitura sem publicar geração antiga',async()=>{
 const {env,db}=setup();await startVodJobs(env,100);const get=env.CATALOG_BUCKET.get;env.CATALOG_BUCKET.get=async(...args)=>{const object=await get(...args);db.prepare("UPDATE catalog_sources SET r2_key='new',synced_at='v2'").run();return object};
 const result=await advanceVodJob(env,{now:101});assert.equal(result.status,'superseded');assert.equal(db.prepare('SELECT COUNT(*) n FROM vod_catalog_items').get().n,0);assert.equal(db.prepare('SELECT snapshot_key FROM vod_catalog_jobs').get().snapshot_key,'new');
});
test('migração SQL e criação automática têm as mesmas tabelas',async()=>{
 const {env,db}=setup();await ensureVodSchema(env.DB);const other=new DatabaseSync(':memory:');other.exec(readFileSync(new URL('../migrations/0013_vod_catalog.sql',import.meta.url),'utf8'));for(const table of ['filmes','series','vod_catalog_jobs','vod_catalog_items'])assert.deepEqual(db.prepare('PRAGMA table_info('+table+')').all(),other.prepare('PRAGMA table_info('+table+')').all());other.close();
});
test('TMDB ignora títulos com tags/gêneros, inclusive quando status ainda é pendente',async()=>{
 const {env,db}=setup();await startVodJobs(env,100);await advanceVodJob(env,{now:101});db.prepare("UPDATE filmes SET tags='[\"Minha tag\"]'").run();db.prepare("UPDATE series SET generos='[\"Drama\"]'").run();env.TMDB_API_KEY='test-only-key';let requests=0;
 const result=await enrichVod(env,{now:200,fetcher:async()=>{requests++;throw Error('Não deve consultar')}});assert.equal(requests,0);assert.equal(result.attempts,0);
});
test('TMDB grava ID e gêneros uma única vez sem sobrescrever nome original',async()=>{
 const {env,db}=setup('#EXTM3U\n#EXTINF:-1 group-title="FILMES",Duna (2021)\nhttps://source.test/movie/u/p/101.mp4\n');await startVodJobs(env,100);await advanceVodJob(env,{now:101});env.TMDB_API_KEY='test-only-key';let requests=0;
 const fetcher=async()=>{requests++;return Response.json({results:[{id:438631,title:'Duna',original_title:'Dune',release_date:'2021-09-15',adult:false,genre_ids:[28,878],poster_path:'/poster.jpg'}]})};
 const first=await enrichVod(env,{now:200,fetcher});assert.equal(first.matched,1);const row=db.prepare('SELECT * FROM filmes').get();assert.equal(row.tmdb_id,438631);assert.notEqual(row.generos,'[]');assert.equal(row.titulo,'Duna');await enrichVod(env,{now:201,fetcher});assert.equal(requests,1);
});
async function accountSetup(){
 const {env,db}=setup();db.exec("CREATE TABLE usuarios(id INTEGER PRIMARY KEY,nome TEXT,usuario TEXT,senha TEXT,nivel_acesso TEXT,lista_http TEXT,lista_https TEXT);INSERT INTO usuarios VALUES (1,'Admin','admin','test-only-password','administrador',NULL,NULL),(2,'User','user','test-only-password','usuario',NULL,NULL)");env.BRIDGE_ACCESS_KEY='test-only-pepper-that-is-at-least-32-chars';
 const request=(user)=>new Request('https://lux.test/api/account/login',{method:'POST',headers:{origin:'https://lux.test','content-type':'application/json'},body:JSON.stringify({identity:user,password:'test-only-password'})});
 const login=async user=>{const response=await accountApi(request(user),env);assert.equal(response.status,200,await response.clone().text());return response.headers.get('set-cookie').split(';')[0]};
 return {env,db,login};
}
const apiRequest=(cookie='',body,query='')=>new Request('https://lux.test/api/admin/vod'+query,{method:body?'POST':'GET',headers:{origin:'https://lux.test','content-type':'application/json',cookie},...(body?{body:JSON.stringify(body)}:{})});
test('painel bloqueia anônimos e usuários comuns no servidor',async()=>{
 const {env,db,login}=await accountSetup();assert.equal((await vodAdminApi(apiRequest(),env)).status,401);assert.equal((await vodAdminApi(apiRequest(await login('user')),env)).status,403);assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='filmes'").get(),undefined);
});
test('admin importa títulos, pagina, edita tags e bloqueia origem/tabela inválidas',async()=>{
 const {env,db,login}=await accountSetup(),cookie=await login('admin');
 let response=await vodAdminApi(apiRequest(cookie,{action:'seed',rows:uniqueVod(parseM3u(sample)).filmes}),env);assert.equal(response.status,200,await response.clone().text());
 response=await vodAdminApi(apiRequest(cookie,undefined,'?view=rows&tipo=filmes&q=du'),env);const data=await response.json();assert.equal(data.total,1);
 response=await vodAdminApi(apiRequest(cookie,{action:'edit',tipo:'filmes',id:data.rows[0].id,titulo:'Duna personalizado',ano:2021,tmdb_id:438631,id_provedor:'101',generos:['Aventura'],tags:['Família'],colecoes:['Favoritos']}),env);assert.equal(response.status,200);assert.equal(db.prepare('SELECT status_metadados FROM filmes').get().status_metadados,'manual');
 assert.equal((await vodAdminApi(apiRequest(cookie,undefined,'?view=rows&tipo=usuarios'),env)).status,400);
 const cross=new Request('https://lux.test/api/admin/vod',{method:'POST',headers:{origin:'https://evil.test','content-type':'application/json',cookie},body:JSON.stringify({action:'start'})});assert.equal((await vodAdminApi(cross,env)).status,403);
});

test('edição manual durante resposta TMDB não é sobrescrita',async()=>{
 const {env,db}=setup('#EXTM3U\n#EXTINF:-1 group-title="FILMES",Duna (2021)\nhttps://source.test/movie/u/p/101.mp4\n');await startVodJobs(env,100);await advanceVodJob(env,{now:101});env.TMDB_API_KEY='test-only-key';
 await enrichVod(env,{now:200,fetcher:async()=>{db.prepare("UPDATE filmes SET tags='[\"Manual\"]',generos='[\"Meu gênero\"]',status_metadados='manual'").run();return Response.json({results:[{id:438631,title:'Duna',original_title:'Dune',release_date:'2021-09-15',adult:false,genre_ids:[28]}]})}});
 const row=db.prepare('SELECT * FROM filmes').get();assert.equal(row.tags,'["Manual"]');assert.equal(row.generos,'["Meu gênero"]');assert.equal(row.tmdb_id,null);
});
test('primeira carga manual funciona mesmo sem snapshot ou bucket configurado',async()=>{
 const {env,db,login}=await accountSetup(),cookie=await login('admin');db.exec('DROP TABLE catalog_sources');delete env.CATALOG_BUCKET;
 const seed=await vodAdminApi(apiRequest(cookie,{action:'seed',rows:uniqueVod(parseM3u(sample)).series}),env);assert.equal(seed.status,200,await seed.clone().text());
 const start=await vodAdminApi(apiRequest(cookie,{action:'start'}),env);assert.equal(start.status,200);assert.equal((await start.json()).sources,0);
 const summary=await vodAdminApi(apiRequest(cookie),env);assert.equal(summary.status,200);assert.equal((await summary.json()).series.total,1);
});
test('snapshot com contagem errada preserva vínculos anteriores e pode reiniciar',async()=>{
 const {env,db}=setup();await startVodJobs(env,100);await advanceVodJob(env,{now:101});const old=db.prepare('SELECT * FROM vod_catalog_items').all();db.prepare("UPDATE catalog_sources SET synced_at='v2',item_count=999").run();await startVodJobs(env,102);
 await assert.rejects(advanceVodJob(env,{now:103}),/contagem/);assert.equal(db.prepare('SELECT status FROM vod_catalog_jobs').get().status,'failed');assert.deepEqual(db.prepare('SELECT * FROM vod_catalog_items').all(),old);
 db.prepare('UPDATE catalog_sources SET item_count=5').run();await startVodJobs(env,104);assert.equal((await advanceVodJob(env,{now:105})).status,'ready');
});
test('classificação usa índices de pendentes e vínculos sem varrer todos os registros',async()=>{
 const {env,db}=setup();await ensureVodSchema(env.DB);
 const plan=db.prepare("EXPLAIN QUERY PLAN SELECT id,titulo,ano FROM filmes WHERE status_metadados NOT IN ('encontrado','manual') AND tags='[]' AND generos='[]' AND consultar_apos<=? AND EXISTS(SELECT 1 FROM vod_catalog_items i WHERE i.tipo=? AND i.item_id=filmes.id) ORDER BY consultar_apos,id LIMIT ?").all(100,'filmes',2).map(x=>x.detail).join('\n');
 assert.match(plan,/filmes_pendentes/);assert.match(plan,/vod_catalog_lookup/);
});

test('reconstrução exige confirmação e limpa somente catálogo sem alterar contas ou fontes',async()=>{
 const {env,db,login}=await accountSetup(),cookie=await login('admin');await startVodJobs(env,100);await advanceVodJob(env,{now:101});
 db.prepare("UPDATE filmes SET tags='[\"Minha tag\"]',status_metadados='manual'").run();
 assert.equal((await vodAdminApi(apiRequest(cookie,{action:'rebuild'}),env)).status,400);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM filmes').get().n,1);
 const response=await vodAdminApi(apiRequest(cookie,{action:'rebuild',confirmation:'RECONSTRUIR CATALOGO'}),env);assert.equal(response.status,200,await response.clone().text());
 for(const table of ['filmes','series','vod_catalog_items','vod_catalog_jobs'])assert.equal(db.prepare('SELECT COUNT(*) n FROM '+table).get().n,0);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM usuarios').get().n,2);assert.equal(db.prepare('SELECT COUNT(*) n FROM catalog_sources').get().n,1);
 await startVodJobs(env,200);assert.equal((await advanceVodJob(env,{now:201})).status,'ready');assert.equal(db.prepare('SELECT COUNT(*) n FROM series').get().n,1);
});
test('reconstrução não apaga dados durante lease de importação ou metadados',async()=>{
 const {env,db,login}=await accountSetup(),cookie=await login('admin');await startVodJobs(env,100);await advanceVodJob(env,{now:101});
 const body={action:'rebuild',confirmation:'RECONSTRUIR CATALOGO'};
 db.prepare('UPDATE vod_catalog_jobs SET lease_until=?').run(Date.now()+120000);
 assert.equal((await vodAdminApi(apiRequest(cookie,body),env)).status,409);
 db.prepare('UPDATE vod_catalog_jobs SET lease_until=0').run();db.prepare("INSERT INTO vod_catalog_state VALUES('metadata_lease',?)").run(String(Date.now()+120000));
 assert.equal((await vodAdminApi(apiRequest(cookie,body),env)).status,409);assert.equal(db.prepare('SELECT COUNT(*) n FROM filmes').get().n,1);
});
test('resumo informa progresso da fonte e falta de configuração TMDB',async()=>{
 const {env,login}=await accountSetup(),cookie=await login('admin');await startVodJobs(env,100);await advanceVodJob(env,{now:101});
 const response=await vodAdminApi(apiRequest(cookie),env),data=await response.json();assert.deepEqual(data.progress,{read:5,total:5});assert.equal(data.tmdb.configured,false);
 const metadata=await enrichVod(env);assert.equal(metadata.pending,true);assert.match(metadata.reason,/TMDB_API_KEY/);
});
test('manutenção classifica enquanto outra parte do snapshot ainda está sendo importada',async()=>{
 const text='#EXTM3U\n'+Array.from({length:10000},(_,i)=>`#EXTINF:-1 group-title="FILMES",Duna (2021)\nhttps://source.test/movie/u/p/${i}.mp4\n`).join('');
 const {env,db}=setup(text);await startVodJobs(env,100);
 // Sem chave, comprova a execução independente do estado building sem consumir rede.
 const result=await runVodMaintenance(env,{now:101});assert.equal(result.index.status,'building');assert.equal(result.metadata.pending,true);assert.match(JSON.parse(db.prepare("SELECT value FROM vod_catalog_state WHERE id='metadata_status'").get().value).reason,/TMDB_API_KEY/);
});

test('classificação reaproveita cache consultado pelo front e persiste na tabela',async()=>{
 const {env,db}=setup('#EXTM3U\n#EXTINF:-1 group-title="FILMES",Duna (2021)\nhttps://source.test/movie/u/p/101.mp4\n');await startVodJobs(env,100);await advanceVodJob(env,{now:101});env.TMDB_API_KEY='test-only-key';
 const request=new Request('https://lux.test/api/metadata/tmdb',{method:'POST',headers:{origin:'https://lux.test','content-type':'application/json'},body:JSON.stringify({type:'movie',title:'Duna',year:2021})});
 const response=await lookupTmdb(request,env,async()=>Response.json({results:[{id:438631,title:'Duna',original_title:'Dune',release_date:'2021-09-15',adult:false,genre_ids:[28,878],poster_path:'/poster.jpg'}]}),()=>200);assert.equal(response.status,200);
 assert.equal(db.prepare('SELECT tmdb_id FROM filmes').get().tmdb_id,null);
 const result=await enrichVod(env,{now:201,fetcher:()=>{throw Error('Cache existente não deve consultar a rede')}});assert.equal(result.matched,1);assert.equal(db.prepare('SELECT tmdb_id FROM filmes').get().tmdb_id,438631);
});

test('reenvio do mesmo lote não regrava títulos ou vínculos e novas referências são unidas',async()=>{
 const {env,db,login}=await accountSetup(),cookie=await login('admin'),rows=uniqueVod(parseM3u(sample)).filmes;
 assert.equal((await vodAdminApi(apiRequest(cookie,{action:'seed',rows}),env)).status,200);
 const before=db.prepare('SELECT total_changes() n').get().n;
 assert.equal((await vodAdminApi(apiRequest(cookie,{action:'seed',rows}),env)).status,200);
 assert.equal(db.prepare('SELECT total_changes() n').get().n,before);
 rows[0].referencias.push({id_provedor:'999',fornecedor:'source.test'});
 assert.equal((await vodAdminApi(apiRequest(cookie,{action:'seed',rows}),env)).status,200);
 assert.equal(JSON.parse(db.prepare('SELECT ids_provedor FROM vod_catalog_items').get().ids_provedor).length,3);
});
test('API mostra cota D1 em vez de sugerir migração ou bucket inexistente',async()=>{
 const {env,login}=await accountSetup(),cookie=await login('admin');await ensureVodSchema(env.DB);const prepare=env.DB.prepare;
 env.DB.prepare=sql=>{if(sql.startsWith('INSERT INTO filmes'))throw new Error("Your account has exceeded D1's free tier daily row write limit.");return prepare(sql)};
 const response=await vodAdminApi(apiRequest(cookie,{action:'seed',rows:uniqueVod(parseM3u(sample)).filmes}),env),data=await response.json();assert.equal(response.status,429);assert.equal(data.code,'D1_DAILY_WRITE_LIMIT');assert.equal(data.stage,'seed_titles');assert.ok(data.reference);assert.ok(!data.error.includes('SQL 0013'));
});
