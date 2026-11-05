import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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
test('pedido legado do cron não baixa todas as listas individuais',async()=>{
 let calls=0;
 const result=await maintenanceRequest(await signed('catalog'),env,{now,
   runCatalog:async()=>{calls++;return {updated:1,failed:0}},
   runVod:async()=>{calls++},
   markHighlights:async()=>{calls++}});
 assert.equal(result.status,200);
 assert.deepEqual(await result.json(),{ok:true,task:'catalog',updated:0,skipped:true});
 assert.equal(calls,0,'uma chamada antiga do cron não deve importar listas privadas');
});
test('worker dedicado autentica o pedido de cron e nao recebe segredo da lista antiga',async()=>{
 const captures=[];
 const result=await dispatchMaintenance({cron:'0 9 * * *'},{LUX_MAINTENANCE_TOKEN:token},async(url,opts)=>{
  const req=new Request(url,opts);captures.push({url,task:req.headers.get('x-lux-maintenance-task')});
  assert.equal(await authorizeMaintenance(req,env,now),true);
  return new Response('ok');
 },now);
 assert.equal(result.task,'highlights');
 assert.deepEqual(captures,[{url:'https://luxplayerzero.pages.dev/api/maintenance/refresh',task:'highlights'}]);
 await assert.rejects(dispatchMaintenance({cron:'0 8 * * *'},{LUX_MAINTENANCE_TOKEN:token},async()=>new Response('ok'),now),/Agendamento desconhecido/);
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

test('cron nao segue redirecionamentos e falha quando Pages devolve 302',async()=>{
 const response=Response.redirect('https://another.example/',302);
 await assert.rejects(dispatchMaintenance({cron:'* * * * *'},{LUX_MAINTENANCE_TOKEN:token},
  async(_url,options)=>{assert.equal(options.redirect,'manual');return response;},now),/Redirecionamento inesperado/);
});

test('Cloudflare Pages roteia o POST interno da manutenção para Functions',()=>{
 const routes=JSON.parse(readFileSync(new URL('../public/_routes.json',import.meta.url),'utf8'));
 assert.ok(routes.include.includes('/api/maintenance/*'),'Sem a rota Pages devolve HTTP 405 sem executar a funcao');
 assert.equal(routes.exclude.some(pattern=>pattern.startsWith('/api/maintenance')),false);
});
