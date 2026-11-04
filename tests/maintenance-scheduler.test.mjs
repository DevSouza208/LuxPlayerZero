import test from 'node:test';
import assert from 'node:assert/strict';
import {maintenanceRequest,authorizeMaintenance} from '../src/maintenance-api.js';
import {dispatchMaintenance} from '../src/maintenance-cron.js';

const token='test-credential-'+'a'.repeat(48);
const now=Date.parse('2026-11-03T08:00:00Z');
const env={LUX_MAINTENANCE_TOKEN:token,DB:{prepare(){}},CATALOG_BUCKET:{get(){},put(){}}};
async function signed(task,time=now){
  const timestamp=String(time),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(token),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(timestamp+String.fromCharCode(10)+task));
  const signature=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  return new Request('https://luxplayerzero.pages.dev/api/maintenance/refresh',{method:'POST',headers:{
    'x-lux-maintenance-task':task,'x-lux-maintenance-time':timestamp,'x-lux-maintenance-signature':signature}});
}
test('rota de manutencao exige assinatura valida, sem sessao do usuario',async()=>{
 assert.equal((await maintenanceRequest(new Request('https://luxplayerzero.pages.dev/api/maintenance/refresh',{method:'POST'}),env,{now})).status,403);
 assert.equal((await maintenanceRequest(await signed('catalog',now-5*60000),env,{now})).status,403);
 assert.equal(await authorizeMaintenance(await signed('catalog'),env,now),true);
 assert.equal(await authorizeMaintenance(await signed('tick'),{...env,LUX_MAINTENANCE_TOKEN:'other-secret-'+'z'.repeat(48)},now),false);
 assert.equal((await maintenanceRequest(new Request('https://luxplayerzero.pages.dev/api/maintenance/refresh'),env,{now})).status,405);
});
test('cron renova o catalogo no Pages, descobre o indice e solicita destaques',async()=>{
 const calls=[],result=await maintenanceRequest(await signed('catalog'),env,{now,
   runCatalog:async()=>{calls.push('catalog');return {updated:1,failed:0}},
   runVod:async(_,options)=>{assert.equal(options.discover,true);calls.push('index');return {index:{status:'building'}}},
   markHighlights:async()=>calls.push('highlight-mark')});
 assert.equal(result.status,200);assert.equal((await result.json()).updated,1);
 assert.deepEqual(calls,['catalog','index','highlight-mark']);
});
test('falha de download nao remove a versao anterior nem inicia o indice',async()=>{
 let indexCalled=false;
 const result=await maintenanceRequest(await signed('catalog'),env,{now,
  runCatalog:async()=>({updated:0,failed:1}),runVod:async()=>{indexCalled=true}});
 assert.equal(result.status,503);assert.equal(indexCalled,false);
});
test('worker dedicado autentica o pedido de cron e nao recebe segredo da lista antiga',async()=>{
 const captures=[];
 const result=await dispatchMaintenance({cron:'0 8 * * *'},{LUX_MAINTENANCE_TOKEN:token},async(url,opts)=>{
  const req=new Request(url,opts);captures.push({url,task:req.headers.get('x-lux-maintenance-task')});
  assert.equal(await authorizeMaintenance(req,env,now),true);
  return new Response('ok');
 },now);
 assert.equal(result.task,'catalog');
 assert.deepEqual(captures,[{url:'https://luxplayerzero.pages.dev/api/maintenance/refresh',task:'catalog'}]);
 await assert.rejects(dispatchMaintenance({cron:'* * * * *'},{},async()=>new Response('ok'),now),/TOKEN/);
});
test('cron minuto e destaques acionam os trabalhos permitidos',async()=>{
 let ticks=0,highlights=0;
 const h=await maintenanceRequest(await signed('highlights'),env,{now,highlights:async()=>{highlights++}});
 assert.equal(h.status,200);assert.equal(highlights,1);
 const t=await maintenanceRequest(await signed('tick'),env,{now,runVod:async(_,options)=>{
  assert.equal(options.discover,true);ticks++;return {index:{status:'idle'}};
 },highlights:async()=>{}});
 assert.equal(t.status,200);assert.equal(ticks,1);
});
