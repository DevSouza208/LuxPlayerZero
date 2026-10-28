import {localData} from './local-data.js';
import {applyProfileChanges,profileChanges} from './profile-sync-model.js';
const notice=(state,message='')=>{if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('lux-sync-status',{detail:{state,message}}));};
/** Local first. Each authenticated profile owns its durable outbox. */
export async function createProfileStore(fetcher=fetch,{storage=localData,now=Date.now,schedule=setTimeout,cancel=clearTimeout,locks=globalThis.navigator?.locks,events=globalThis.window,onStatus=notice}={}){
 const options={credentials:'same-origin',cache:'no-store'};
 async function readRemote(){
  const response=await fetcher('/api/account/state',options);
  if(!response.ok)throw Error('Entre novamente para carregar seu perfil.');
  const data=await response.json();if(!data.profileId||!Number.isSafeInteger(data.version))throw Error('Perfil inválido.');return data;
 }
 const initial=await readRemote(),profileId=initial.profileId,key='profile:'+profileId;
 let record={profileId,base:initial.value||{},version:initial.version,ops:{}},state,local=true,chain=Promise.resolve(),flight=null,timer=null,due=Infinity,retry=0,paused=false,disposed=false;
 const serial=fn=>{const work=chain.then(fn);chain=work.catch(()=>{});return work};
 async function update(fn){
  if(local)try{record=await storage.update(key,current=>fn(current||record));return record}catch{local=false;onStatus('warning','Armazenamento local indisponível. Mantenha esta aba aberta até sincronizar.');}
  record=fn(record);return record;
 }
 await update(current=>({...current,base:current.version>initial.version?current.base:initial.value||{},version:Math.max(current.version,initial.version),ops:current.ops||{}}));
 state=applyProfileChanges(record.base,record.ops);
 const viewState=structuredClone(state);
 function plan(delay){
  if(disposed||paused)return;const target=now()+delay;if(timer!==null&&target>=due)return;
  if(timer!==null)cancel(timer);due=target;timer=schedule(()=>{timer=null;due=Infinity;void flush().catch(()=>{});},delay);timer?.unref?.();
 }
 async function send(){
  let latest=record;
  if(local)try{latest=await storage.get(key)||record}catch{}
  if(!Object.keys(latest.ops||{}).length)return true;
  if(latest.retryAt>now()){plan(latest.retryAt-now());return false;}
  for(let attempt=0;attempt<3;attempt++){
   const sent=structuredClone(latest),value=applyProfileChanges(sent.base,sent.ops);
   let response;
   const body=JSON.stringify({profileId,version:sent.version,value});
   try{response=await fetcher('/api/account/state',{...options,method:'POST',keepalive:new TextEncoder().encode(body).byteLength<=60000,headers:{'content-type':'application/json'},body})}
   catch{throw Error('Sem conexão. As alterações aguardam sincronização neste dispositivo.');}
   if(response.status===409){
    const remote=await readRemote();if(remote.profileId!==profileId){paused=true;throw Error('O perfil mudou. Entre novamente para sincronizar.');}
    await serial(()=>update(current=>({...current,base:remote.value||{},version:remote.version})));latest=record;continue;
   }
   if(!response.ok){
    if(response.status===401||response.status===403)paused=true;
    const error=Error(response.status===429?'Muitas solicitações. A sincronização será tentada mais tarde.':'Não foi possível sincronizar. As alterações continuam neste dispositivo.');
    error.retryAfter=response.status===429?Math.max(1,Number(response.headers.get('retry-after'))||60)*1000:0;throw error;
   }
   const data=await response.json();if(!Number.isSafeInteger(data.version)||data.version!==sent.version+1)throw Error('Não foi possível confirmar a sincronização.');
   await serial(async()=>{
    await update(current=>{
     const ops={...current.ops};for(const [id,op]of Object.entries(sent.ops))if(ops[id]?.token===op.token)delete ops[id];
     return {...current,base:value,version:data.version,retryAt:0,ops};
    });state=applyProfileChanges(record.base,record.ops);
   });
   retry=0;onStatus(Object.keys(record.ops).length?'pending':'synced');if(Object.keys(record.ops).length)plan(30000);return true;
  }
  throw Error('Há alterações em outro dispositivo. Tentaremos sincronizar novamente.');
 }
 function flush(){
  if(flight)return flight;if(paused||disposed)return Promise.resolve(false);
  if(timer!==null)cancel(timer);timer=null;due=Infinity;
  flight=(async()=>{
   await chain;
   try{return locks?.request?await locks.request('lux-sync:'+profileId,{ifAvailable:true},async lock=>{if(!lock){plan(30000);return false}return send()}):await send()}
   catch(error){
    const delay=Math.max(error.retryAfter||0,Math.min(300000,5000*2**Math.min(retry++,6)))+Math.floor(Math.random()*1000);
    await serial(()=>update(current=>({...current,retryAt:now()+delay})));
    onStatus('warning',error.message);plan(delay);throw error;
   }
  })().finally(()=>{flight=null});return flight;
 }
 const hidden=()=>{if(events?.document?.visibilityState==='hidden')void flush().catch(()=>{})};
 const leave=()=>{void flush().catch(()=>{})},online=()=>{paused=false;void flush().catch(()=>{})};
 events?.document?.addEventListener('visibilitychange',hidden);events?.addEventListener('pagehide',leave);events?.addEventListener('online',online);
 if(Object.keys(record.ops).length)plan(1000);
 return {
  profileId,
  read(name,fallback){const value=structuredClone(state[name]??fallback);viewState[name]=structuredClone(value);return value},
  write(name,value){const snapshot=structuredClone(value);return serial(async()=>{
   const ops=profileChanges(name,viewState[name],snapshot,now(),crypto.randomUUID());if(!Object.keys(ops).length)return true;
   await update(current=>({...current,ops:{...current.ops,...ops}}));viewState[name]=snapshot;state=applyProfileChanges(record.base,record.ops);onStatus('pending');plan(local?(name==='recent'?300000:30000):0);return true;
  })},
  flush,
  pending(){return Object.keys(record.ops).length>0},
  dispose(){disposed=true;if(timer!==null)cancel(timer);events?.document?.removeEventListener('visibilitychange',hidden);events?.removeEventListener('pagehide',leave);events?.removeEventListener('online',online)}
 };
}
