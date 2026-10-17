import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeDetails} from '../src/detail-metadata.js';
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
 const cookie=login.headers.get('set-cookie').split(';')[0];let calls=0;
 const provider=async(url,options)=>{calls++;assert.equal(new URL(url).origin,'https://api.themoviedb.org');assert.equal(options.redirect,'error');return Response.json({id:10,credits:{cast:[{name:'Ator'}]}})};
 const call=(token=cookie,site=origin,type='movie')=>detailMetadata(new Request(origin+'/api/metadata/details',{method:'POST',headers:{origin:site,'content-type':'application/json',cookie:token},body:JSON.stringify({tmdbId:10,type})}),env,provider);
 assert.equal((await call('')).status,401);assert.equal((await call(cookie,'https://other.example')).status,403);assert.equal((await call(cookie,origin,'unknown')).status,400);
 const first=await call();assert.equal(first.status,200);assert.equal((await first.json()).cast[0].name,'Ator');
 const second=await call();assert.equal(second.status,200);assert.equal((await second.text()).includes(env.TMDB_API_KEY),false);assert.equal(calls,1);assert.match(second.headers.get('cache-control'),/no-store/);
});
