import test from 'node:test';
import assert from 'node:assert/strict';
import {indexChunk} from '../src/catalog-search.js';
const encode=s=>new TextEncoder().encode(s);
test('índice secundário não contém URLs e respeita registros incompletos entre trechos',()=>{
 const a=encode('#EXTM3U\n#EXTINF:-1 group-title="Filmes",Ação (2026)\nhttp://private.example/u/p/1.mp4\n#EXTINF:-1 group-title="Séries",Série S01E01\nhttp://priv');
 const result=indexChunk(a);assert.equal(result.rows.length,1);assert.equal(result.rows[0].kind,'movies');
 assert.equal(result.rows[0].year,2026);assert.equal(JSON.stringify(result.rows).includes('private'),false);
 const tail=new TextDecoder().decode(a.slice(result.consumed))+'ate.example/series/2.mp4';
 const next=indexChunk(encode(tail),{group:result.group,final:true});assert.equal(next.rows.length,1);assert.equal(next.rows[0].kind,'series');
});
test('trechos limitam memória/trabalho e preservam contagem em 10 mil entradas',()=>{
 let text='#EXTM3U\n';for(let i=0;i<10000;i++)text+='#EXTINF:-1 group-title="Filmes",Título '+i+'\nhttp://example.com/movie/'+i+'\n';
 const bytes=encode(text);let cursor=0,count=0,group='';
 while(cursor<bytes.length){const slice=bytes.slice(cursor,cursor+512*1024);const result=indexChunk(slice,{group,final:cursor+slice.length===bytes.length});assert.ok(result.rows.length<=400);assert.ok(result.consumed>0);cursor+=result.consumed;count+=result.rows.length;group=result.group;}
 assert.equal(count,10000);
});
import {database} from './helpers/d1.mjs';
import {readFileSync} from 'node:fs';
import {accountApi} from '../src/account-api.js';
import {catalogSearchApi} from '../src/catalog-search.js';
import {connect} from '../src/bridge-core.js';
test('construção publica índice completo no SQLite e exige as duas sessões',async()=>{
 const env={DB:database(),LUX_AUTH_PEPPER:'test-only-search-pepper-for-integration',LUX_ADMIN_BOOTSTRAP_PASSWORD:'test-only-search-bootstrap-password',BRIDGE_ACCESS_KEY:'test-only-search-bridge-password',BRIDGE_ALLOWED_HOSTS:'source.example'};
 for(const migration of ['0001_catalog_sources.sql','0007_catalog_search.sql'])env.DB.db.exec(readFileSync(new URL('../migrations/'+migration,import.meta.url),'utf8'));
 const req=(path,body,cookie='')=>new Request('https://lux.example'+path,{method:body?'POST':'GET',headers:{origin:'https://lux.example','content-type':'application/json',cookie},body:body?JSON.stringify(body):undefined});
 const login=await accountApi(req('/api/account/login',{identity:'admin',password:env.LUX_ADMIN_BOOTSTRAP_PASSWORD}),env);
 const accountCookie=login.headers.get('set-cookie').split(';')[0];
 const bridge=await connect(req('/api/bridge/connect',{key:env.BRIDGE_ACCESS_KEY}),env);
 assert.equal(bridge.status,200);const cookies=accountCookie+'; '+bridge.headers.get('set-cookie').split(';')[0];
 let content='#EXTM3U\n';for(let i=0;i<85;i++)content+='#EXTINF:-1 group-title="Filmes",Filme '+i+'\nhttps://source.example/movie/'+i+'\n';
 const bytes=encode(content);
 env.DB.db.prepare('INSERT INTO catalog_sources VALUES (?,?,?,?,?,?)').run('hash','catalog','snapshot','2026-10-17T00:00:00Z',85,bytes.length);
 let reads=0;env.CATALOG_BUCKET={get:async(key,{range})=>{reads++;assert.equal(key,'snapshot');return {arrayBuffer:async()=>bytes.slice(range.offset,range.offset+range.length).buffer}}};
 assert.equal((await catalogSearchApi(req('/api/catalog/search',{catalogId:'catalog'},accountCookie),env)).status,401);
 let job=await (await catalogSearchApi(req('/api/catalog/search',{catalogId:'catalog'},cookies),env)).json();
 assert.ok(job.generation);
 for(let i=0;i<10&&job.status!=='ready';i++){const r=await catalogSearchApi(req('/api/catalog/search',{generation:job.generation},cookies),env);assert.equal(r.status,200,await r.clone().text());job=await r.json()}
 assert.equal(job.status,'ready');assert.equal(job.count,85);assert.equal(reads,3);
 const response=await catalogSearchApi(req('/api/catalog/search?catalogId=catalog&kind=movies&page=2',null,cookies),env);
 const data=await response.json();assert.equal(data.total,85);assert.equal(data.entries[0].ordinal,48);assert.equal(data.entries.length,37);assert.equal(JSON.stringify(data).includes('source.example'),false);
});
