import {refreshDailyCatalogs} from './catalog-snapshot.js';
import {runVodMaintenance} from './vod-catalog.js';
import {processImageQueue} from './vod-images.js';
import {prepareHighlights,markHighlightsRefresh} from './daily-highlights.js';

const TASKS=new Set(['catalog','highlights','tick']);
const encoder=new TextEncoder();
const response=(status,data)=>new Response(JSON.stringify(data),{
  status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}
});

/** Only the cron Worker knows this shared secret; it is never sent to the browser. */
export async function authorizeMaintenance(request,env,now=Date.now()){
  const secret=env.LUX_MAINTENANCE_TOKEN;
  if(typeof secret!=='string'||secret.length<32)return false;
  const task=request.headers.get('x-lux-maintenance-task')||'';
  const timestamp=request.headers.get('x-lux-maintenance-time')||'';
  const signature=request.headers.get('x-lux-maintenance-signature')||'';
  if(!TASKS.has(task)||!/^[0-9]{13}$/.test(timestamp)||!/^[a-f0-9]{64}$/.test(signature))return false;
  if(Math.abs(now-Number(timestamp))>120000)return false;
  try{
    const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    const bytes=Uint8Array.from(signature.match(/.{2}/g),pair=>Number.parseInt(pair,16));
    return crypto.subtle.verify('HMAC',key,bytes,encoder.encode(timestamp+String.fromCharCode(10)+task));
  }catch{return false;}
}

/** Executes in Pages Functions, where the existing encrypted bridge key, DB and R2 are bound. */
export async function maintenanceRequest(request,env,{now=Date.now(),runCatalog=refreshDailyCatalogs,runVod=runVodMaintenance,highlights=prepareHighlights,markHighlights=markHighlightsRefresh}={}){
  if(request.method!=='POST')return response(405,{ok:false});
  if(!await authorizeMaintenance(request,env,now))return response(403,{ok:false});
  if(!env.DB?.prepare||!env.CATALOG_BUCKET?.get||!env.CATALOG_BUCKET?.put)return response(503,{ok:false,error:'Armazenamento indisponível.'});
  const task=request.headers.get('x-lux-maintenance-task');
  try{
    if(task==='catalog'){
      // Compatibilidade com Workers agendados antigos: não baixar todas as
      // M3U privadas. Cada usuário sincroniza somente a própria no acesso.
      return response(200,{ok:true,task:'catalog',updated:0,skipped:true});
    }
    if(task==='highlights'){
      await highlights(env,{scheduled:true});
      return response(200,{ok:true,task});
    }
    // Recover stuck imports even if a previous daily discovery attempt failed.
    const minute=new Date(now).getUTCMinutes();
    const result=await runVod(env,{discover:minute%15===0,now});
    // Cada minuto: uma fila independente converte as imagens antigas/novas.
    // Wall time e bytes sao contabilizados; ao atingir o teto o trabalho pausa sem cobranca de Images.
    let images;
    try{images=await processImageQueue(env,{limit:4});}
    catch(error){images={error:true};console.error('Lux image queue failed: '+String(error?.message||'unknown').slice(0,160));}
    const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',hourCycle:'h23'}).format(new Date(now)));
    if(hour>=6&&minute%15===0)await highlights(env,{scheduled:true});
    return response(200,{ok:true,task,index:result?.index?.status||'unknown',images});
  }catch(error){
    // No provider URL, secret, token or source ciphertext in logs.
    console.error('Lux maintenance '+task+' failed: '+String(error?.message||'unknown').slice(0,180));
    return response(503,{ok:false,error:'A manutenção não terminou por completo; a versão já publicada permanece preservada.'});
  }
}
