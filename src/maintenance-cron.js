/* Lux Zero dedicated scheduler. Private catalog operations run in Pages, not here. */
const DESTINATION='https://luxplayerzero.pages.dev/api/maintenance/refresh';
const encoder=new TextEncoder();
const TASK_BY_CRON={
  // Listas privadas são atualizadas por usuário no primeiro acesso, não em lote.
  '0 9 * * *':'highlights', // 06h Sao Paulo / 09:00 UTC
  '* * * * *':'tick'
};
export async function dispatchMaintenance(event,env,fetcher=fetch,now=Date.now()){
  const task=TASK_BY_CRON[event?.cron];
  if(!task)throw Error('Agendamento desconhecido.');
  const secret=env?.LUX_MAINTENANCE_TOKEN;
  if(typeof secret!=='string'||secret.length<32)throw Error('LUX_MAINTENANCE_TOKEN ausente no Worker.');
  const timestamp=String(now);
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(timestamp+String.fromCharCode(10)+task))),
    byte=>byte.toString(16).padStart(2,'0')).join('');
  const response=await fetcher(DESTINATION,{method:'POST',cache:'no-store',redirect:'manual',
    headers:{'x-lux-maintenance-task':task,'x-lux-maintenance-time':timestamp,'x-lux-maintenance-signature':signature}});
  // O runtime Workers nao aceita redirect:error: usamos manual e nunca seguimos 3xx.
  if(response.status>=300&&response.status<400)throw Error('Redirecionamento inesperado na manutencao (HTTP '+response.status+').');
  if(!response.ok)throw Error('Falha na manutencao do Lux Zero (HTTP '+response.status+').');
  return {task,ok:true};
}
export default {
  scheduled(event,env,ctx){const operation=dispatchMaintenance(event,env);ctx.waitUntil(operation);return operation;},
  fetch(){return new Response('Not Found',{status:404,headers:{'cache-control':'no-store'}});}
};
