import {cleanTvGuide,GUIDE_TTL,TVMAP_SOURCE} from '../public/tvmap-model.js';
const KEY='editorial/tvmap-guide-v1.json',RETRY='editorial/tvmap-guide-retry-v1.json',MAX_BYTES=1500000;
const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
const decode=value=>String(value||'').replace(/<[^>]*>/g,' ').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_,key)=>{if(key[0]!=='#')return entities[key.toLowerCase()]||' ';const point=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));return point>0&&point<=0x10ffff?String.fromCodePoint(point):' ';}).replace(/\s+/g,' ').trim();
const attribute=(attrs,name)=>new RegExp('\\b'+name+'\\s*=\\s*["\x27]([^"\x27]*)["\x27]','i').exec(attrs)?.[1]||'';
function midnight(now){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now)).map(p=>[p.type,p.value]));
 const local=Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute,+parts.second),offset=local-Math.floor(now/1000)*1000;
 return Date.UTC(+parts.year,+parts.month-1,+parts.day)-offset;
}
/** Apenas nomes/horários visíveis da grade pública; não executa scripts nem importa HTML. */
export function parseTvMap(html,now=Date.now()){
 if(typeof html!=='string'||html.length>MAX_BYTES)throw Error('Resposta da programação inválida.');
 const rows=[...html.matchAll(/<table\b(?=[^>]*\bid=["']zc-st-\d+["'])[^>]*>/gi)];
 if(!rows.length||rows.length>80)throw Error('A fonte não entregou a grade esperada.');
 const header=html.slice(0,rows[0].index),tick=/(\d{1,2}):(\d{2})hs/.exec(decode(header));
 if(!tick||+tick[1]>23||+tick[2]>59)throw Error('Horário da grade não informado.');
 const day=midnight(now);let windowStart=day+(+tick[1]*60 + +tick[2])*60000;
 if(windowStart>now+30*60000)windowStart-=86400000;
 const windowEnd=windowStart+3*3600000;
 if(windowStart>now+30*60000||windowEnd<=now)throw Error('A fonte entregou uma grade fora do horário atual.');
 const channels=[];
 for(let i=0;i<rows.length;i++){
  const row=html.slice(rows[i].index,i+1<rows.length?rows[i+1].index:html.length);
  const anchors=[...row.matchAll(/<a\b([^>]{0,4096})>([\s\S]*?)<\/a>/gi)];
  const name=anchors.filter(a=>/\bzc-st-a\b/.test(attribute(a[1],'class'))).map(a=>decode(a[2])).find(Boolean);
  if(!name)continue;
  const image=/<img\b([^>]*)>/i.exec(row),imagePath=image?attribute(image[1],'src'):'';
  const slots=anchors.filter(a=>/\bzc-pg-t\b/.test(attribute(a[1],'class'))),programs=[];let previous=windowStart-6*3600000;
  for(let j=0;j<slots.length;j++){
   const a=slots[j],tail=row.slice(a.index+a[0].length,j+1<slots.length?slots[j+1].index:row.length),duration=/(\d+)min\s*\/\s*(\d+)min/.exec(decode(tail));
   const time=/<span\b[^>]*class=["'][^"']*\bzc-pg-e\b[^"']*["'][^>]*>\s*(\d{1,2}):(\d{2})/i.exec(tail);
   let start=null;
   if(time&&+time[1]<24&&+time[2]<60){start=day+(+time[1]*60 + +time[2])*60000;while(start<previous)start+=86400000;previous=start;}
   // Programas anteriores sem horário não são apresentados como atuais.
   if(!time&&!duration)continue;
   const href=attribute(a[1],'href');programs.push({title:decode(a[2]),start,end:null,current:Boolean(duration),progress:duration&&+duration[2]>0?Number(duration[1])/Number(duration[2]):null,duration:duration?Number(duration[2])*60000:null,sourceUrl:/^\/c\d+\/[a-zA-Z0-9-]+$/.test(href)?'https://tvmap.com.br'+href:''});
  }
  for(let j=0;j<programs.length;j++){
   const next=programs[j+1]?.start;if(Number.isFinite(next)){programs[j].end=next;if(programs[j].current&&programs[j].duration)programs[j].start=next-programs[j].duration;}
  }
  if(programs.length)channels.push({name,logo:/^\/images\/ch\/\d+\.(?:jpg|png)$/.test(imagePath)?'https://tvmap.com.br'+imagePath:'',programs});
 }
 const guide=cleanTvGuide({version:1,fetchedAt:now,windowStart,windowEnd,channels});if(!guide.channels.length)throw Error('Nenhum programa com horário válido na fonte.');return guide;
}
async function sourceText(response){
 const reader=response.body?.getReader();if(!reader)throw Error('Resposta vazia');let bytes=0,result='';const decoder=new TextDecoder();
 try{while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_BYTES)throw Error('Resposta muito grande');result+=decoder.decode(value,{stream:true});}return result+decoder.decode();}
 catch(error){await reader.cancel().catch(()=>{});throw error;}
}
const flights=new WeakMap();
export async function loadTvGuide(env,{now=Date.now(),fetcher=fetch}={}){
 if(!env.CATALOG_BUCKET?.get||!env.CATALOG_BUCKET?.put)throw Object.assign(Error('Guia indisponível.'),{code:'TV_GUIDE_CONFIG'});
 const object=await env.CATALOG_BUCKET.get(KEY);let saved=null;try{if(object)saved=cleanTvGuide(await object.json());}catch{}
 if(saved&&now-saved.fetchedAt<GUIDE_TTL&&saved.windowEnd>now)return {guide:saved,stale:false};
 const marker=await env.CATALOG_BUCKET.get(RETRY),retry=marker?await marker.json():null;
 if(retry?.after>now&&retry.code){if(saved&&saved.windowEnd>now)return {guide:saved,stale:true};throw Object.assign(Error('A programação está temporariamente indisponível.'),{code:retry.code,upstreamStatus:retry.upstreamStatus,formatReason:retry.formatReason});}
 if(flights.has(env))return flights.get(env);
 const work=(async()=>{
  let stage='fetch';
  try{
   const response=await fetcher(TVMAP_SOURCE,{method:'GET',redirect:'manual',headers:{accept:'text/html','cache-control':'no-cache'},signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw Object.assign(Error('Fonte indisponível.'),{code:'TVMAP_HTTP',upstreamStatus:response.status});
   stage='parse';const guide=parseTvMap(await sourceText(response),now);
   stage='cache';
   await env.CATALOG_BUCKET.put(KEY,JSON.stringify(guide),{httpMetadata:{contentType:'application/json'}});return {guide,stale:false};
  }catch(error){
   const reasons=['Resposta da programação inválida.','A fonte não entregou a grade esperada.','Horário da grade não informado.','A fonte entregou uma grade fora do horário atual.','Nenhum programa com horário válido na fonte.'];
   const formatReason=stage==='parse'&&reasons.includes(error.message)?error.message:undefined;
   const code=error.code==='TVMAP_HTTP'?'TVMAP_HTTP':stage==='fetch'?'TVMAP_NETWORK':stage==='parse'?'TVMAP_FORMAT':'TVMAP_CACHE';
   await env.CATALOG_BUCKET.put(RETRY,JSON.stringify({after:now+5*60000,code,upstreamStatus:error.upstreamStatus,formatReason}),{httpMetadata:{contentType:'application/json'}}).catch(()=>{});
   if(saved&&saved.windowEnd>now)return {guide:saved,stale:true};throw Object.assign(Error('Não foi possível atualizar a programação do TV Map.'),{code,upstreamStatus:error.upstreamStatus,formatReason});
  }
 })();flights.set(env,work);try{return await work;}finally{flights.delete(env);}
}
/** Dados públicos de programação. Nenhuma sessão, playlist ou consulta D1 neste endpoint. */
export async function tvMapGuideApi(request,env){
 if(request.method!=='GET')return Response.json({error:'Método não permitido.'},{status:405,headers:{allow:'GET'}});
 try{
  const cache=globalThis.caches?.default,url=new URL(request.url);url.search='';const key=new Request(url.href);
  if(cache){const cached=await cache.match(key);if(cached)return cached;}
  const response=Response.json(await loadTvGuide(env),{headers:{'cache-control':'public, max-age=60, s-maxage=300','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
  if(cache)await cache.put(key,response.clone()).catch(()=>{});return response;
 }
 catch(error){return Response.json({error:'A programação do TV Map está temporariamente indisponível.',code:['TV_GUIDE_CONFIG','TVMAP_HTTP','TVMAP_NETWORK','TVMAP_FORMAT','TVMAP_CACHE'].includes(error.code)?error.code:'TV_GUIDE_UNAVAILABLE',upstreamStatus:Number.isInteger(error.upstreamStatus)?error.upstreamStatus:undefined,formatReason:error.code==='TVMAP_FORMAT'?error.formatReason:undefined},{status:503,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});}
}
