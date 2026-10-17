import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {xmltvTime,nowNext} from '../public/guide-model.js';
import {editorialApi} from '../src/editorial-api.js';
import {accountApi} from '../src/account-api.js';
import {database} from './helpers/d1.mjs';
test('XMLTV respeita offset, limites de datas e não inventa fuso ausente',()=>{
 assert.equal(xmltvTime('20261017090000 -0300'),Date.parse('2026-10-17T12:00:00Z'));
 assert.equal(xmltvTime('20260230090000 +0000'),null);assert.equal(xmltvTime('20261017090000'),null);
 assert.equal(xmltvTime('20261017250000 -0300'),null);
});
test('agora/próximo usa ID exato e fronteira de horário sem programa fictício',()=>{
 const programs=[{channel:'sportv1',start:100,end:200},{channel:'sportv1',start:200,end:300},{channel:'sportv2',start:100,end:500}];
 assert.equal(nowNext(programs,'sportv1',150).progress,.5);
 assert.equal(nowNext(programs,'sportv1',200).current.start,200);
 assert.equal(nowNext(programs,'missing',150).current,null);
});
test('programação persiste no banco, exige admin e não depende de fonte de vídeo',async()=>{
 const env={DB:database(),LUX_AUTH_PEPPER:'test-pepper-for-editorial-integration-only',LUX_ADMIN_BOOTSTRAP_PASSWORD:'test-editorial-bootstrap-password'};
 env.DB.db.exec(readFileSync(new URL('../migrations/0004_editorial.sql',import.meta.url),'utf8'));
 const request=(path,body,cookie='')=>new Request('https://lux.example'+path,{method:body?'POST':'GET',headers:{origin:'https://lux.example','content-type':'application/json',cookie},body:body?JSON.stringify(body):undefined});
 const login=await accountApi(request('/api/account/login',{identity:'admin',password:env.LUX_ADMIN_BOOTSTRAP_PASSWORD}),env);
 const cookie=login.headers.get('set-cookie').split(';')[0];const start=Date.now()+10000,end=start+60000;
 assert.equal((await editorialApi(request('/api/editorial/guide',{programs:[{channel:'sportv',title:'Programa real fornecido no teste',start,end}]},cookie),env)).status,200);
 const result=await editorialApi(request('/api/editorial/guide?channel=sportv&from='+start+'&to='+end,null,cookie),env);
 assert.equal((await result.json()).programs.length,1);
 assert.equal((await editorialApi(request('/api/editorial/guide',null),env)).status,401);
 assert.equal((await editorialApi(request('/api/editorial/sports',{title:'Jogo',sport:'Futebol',competition:'Copa',start,sourceUrl:'https://example.com/event',channels:['sportv']},cookie),env)).status,400);
});
