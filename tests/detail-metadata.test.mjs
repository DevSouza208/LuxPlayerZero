import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeDetails,sanitizeCollection} from '../src/detail-metadata.js';
test('metadados detalhados usam certificação BR e trailer oficial validado',()=>{
 const data={id:10,credits:{cast:[{name:'Nome',character:'Papel'}],crew:[{name:'Diretor',job:'Director'}]},release_dates:{results:[{iso_3166_1:'BR',release_dates:[{certification:'12'}]}]},videos:{results:[{site:'YouTube',official:false,type:'Trailer',key:'abcde123456'},{site:'YouTube',official:true,type:'Trailer',key:'123456abcde'}]}};
 const result=sanitizeDetails(data,'movie',10);assert.equal(result.certification,'12');assert.equal(result.trailer,'https://www.youtube.com/watch?v=123456abcde');assert.deepEqual(result.directors,['Diretor']);
 assert.throws(()=>sanitizeDetails({...data,id:11},'movie',10));
 assert.equal(sanitizeDetails({...data,videos:{results:[{site:'YouTube',official:true,type:'Trailer',key:'javascript:alert(1)'}]}},'movie',10).trailer,null);
});

import {readFileSync} from 'node:fs';
import {database} from './helpers/d1.mjs';
import {accountApi} from '../src/account-api.js';
import {detailMetadata} from '../src/detail-metadata.js';
test('endpoint exige sessão e origem, restringe provedor e reutiliza cache sem vazar chave',async()=>{
 const env={DB:database(),LUX_AUTH_PEPPER:'test-only-details-pepper-long-enough',LUX_ADMIN_BOOTSTRAP_PASSWORD:'test-only-strong-bootstrap-password',TMDB_API_KEY:'test-only-key'};
 env.DB.db.exec(readFileSync(new URL('../migrations/0008_detail_metadata.sql',import.meta.url),'utf8'));
 const origin='https://lux.example';
 const login=await accountApi(new Request(origin+'/api/account/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({identity:'admin',password:env.LUX_ADMIN_BOOTSTRAP_PASSWORD})}),env);
 const cookie=login.headers.get('set-cookie').split(';')[0];let calls=0,failCollection=false;
 const provider=async(url,options)=>{calls++;if(failCollection&&new URL(url).pathname.includes('/collection/'))throw Error('Provider timeout');assert.equal(new URL(url).origin,'https://api.themoviedb.org');assert.equal(options.redirect,'error');return Response.json(new URL(url).pathname.includes('/collection/')?{id:55,parts:[{id:11,title:'Continuação',release_date:'2024-01-01'}]}:{id:10,belongs_to_collection:{id:55,name:'Coleção'},credits:{cast:[{name:'Ator'}]}})};
 const call=(token=cookie,site=origin,type='movie')=>detailMetadata(new Request(origin+'/api/metadata/details',{method:'POST',headers:{origin:site,'content-type':'application/json',cookie:token},body:JSON.stringify({tmdbId:10,type})}),env,provider);
 assert.equal((await call('')).status,401);assert.equal((await call(cookie,'https://other.example')).status,403);assert.equal((await call(cookie,origin,'unknown')).status,400);
 const first=await call();assert.equal(first.status,200);const data=await first.json();assert.equal(data.cast[0].name,'Ator');assert.equal(data.collection.status,'ready');assert.equal(data.collection.parts[0].id,11);
 const second=await call();assert.equal(second.status,200);assert.equal((await second.text()).includes(env.TMDB_API_KEY),false);assert.equal(calls,2);assert.match(second.headers.get('cache-control'),/no-store/);
 await env.DB.prepare('DELETE FROM detail_metadata_cache').run();failCollection=true;
 const partial=await call();assert.equal(partial.status,200);const partialData=await partial.json();assert.equal(partialData.cast[0].name,'Ator');assert.equal(partialData.collection.status,'unavailable');assert.deepEqual(partialData.collection.parts,[]);
});

test('collection metadata validates identity, adult flag and bounded member fields',()=>{
 assert.throws(()=>sanitizeCollection({id:2},1));
 assert.deepEqual(sanitizeCollection({id:1,parts:[{id:10,title:'Continuação',release_date:'2024-01-01'},{id:11,adult:true},{id:'bad'}]},1),[{id:10,title:'Continuação',year:'2024'}]);
 assert.equal(sanitizeDetails({id:10,belongs_to_collection:{id:'../../bad'}},'movie',10).collection,null);
 assert.equal(sanitizeDetails({id:10,belongs_to_collection:{id:55}},'tv',10).collection,null);
});
