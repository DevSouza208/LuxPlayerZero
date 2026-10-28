import {lookupTmdb} from './tmdb-metadata.js';
import {detailMetadata} from './detail-metadata.js';
import {bodyJson,HttpError,reply} from './account-security.js';
const encoder=new TextEncoder();
async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
/** Public presentation cache only. No accounts, playlists, credentials or D1 operations. */
export function createLiveMetadataCache({clock=Date.now,edgeCache=null,maxEntries=256,maxBytes=8*1024*1024,burst=40,rate=10}={}){
 const entries=new Map();let bytes=0,tokens=burst,last=clock();
 function remember(key,value,expires){
  const size=encoder.encode(JSON.stringify(value)).length,old=entries.get(key);if(old){bytes-=old.size;entries.delete(key);}
  if(size>maxBytes||expires<=clock())return;
  while(entries.size&&(entries.size>=maxEntries||bytes+size>maxBytes)){const first=entries.keys().next().value;bytes-=entries.get(first).size;entries.delete(first);}
  entries.set(key,{value,expires,size});bytes+=size;
 }
 const cacheKey=async(key,origin)=>new Request(origin+'/__lux_metadata_cache/v1/'+await digest(key));
 return {
  take(){const now=clock();tokens=Math.min(burst,tokens+Math.max(0,now-last)*rate/1000);last=now;if(tokens<1)return false;tokens--;return true;},
  async get(key,origin='https://lux.internal'){
   const row=entries.get(key);if(row){if(row.expires>clock()){entries.delete(key);entries.set(key,row);return structuredClone(row.value);}bytes-=row.size;entries.delete(key);}
   if(edgeCache)try{const hit=await edgeCache.match(await cacheKey(key,origin));if(hit){const data=await hit.json();if(data.expires>clock()){remember(key,data.value,data.expires);return data.value;}}}catch{/* Cache availability never blocks TMDB. */}
   return null;
  },
  async put(key,value,expires,origin='https://lux.internal'){
   remember(key,structuredClone(value),expires);
   if(edgeCache&&expires>clock())try{await edgeCache.put(await cacheKey(key,origin),new Response(JSON.stringify({value,expires}),{headers:{'content-type':'application/json','cache-control':'public, max-age='+Math.max(1,Math.floor((expires-clock())/1000))}}));}catch{/* The response and memory cache remain usable. */}
  }
 };
}
let shared;
const pending=new Map();
function sharedCache(){return shared??=createLiveMetadataCache({edgeCache:globalThis.caches?.default||null});}
export function liveMetadataStatus(env){return reply({configured:typeof env?.TMDB_API_KEY==='string'&&Boolean(env.TMDB_API_KEY.trim())});}
/** Same routes for old/new clients; D1-backed classifier imports lookupTmdb directly. */
export async function liveMetadata(request,env,kind,{fetcher=fetch,cache=sharedCache()}={}){
 try{
  if(request.method!=='POST')throw new HttpError(405,'Método não permitido.');
  const body=await bodyJson(request,kind==='lookup'?400:500);
  const upstreamRequest=new Request(request.url,{method:'POST',headers:{origin:request.headers.get('origin'),'content-type':'application/json'},body:JSON.stringify(body)});
  if(!['lookup','details'].includes(kind))throw new HttpError(400,'Consulta inválida.');
  if(typeof env?.TMDB_API_KEY!=='string'||!env.TMDB_API_KEY.trim())throw new HttpError(503,'TMDB não configurado.');
  const origin=new URL(request.url).origin,scope=origin+':'+await digest(env.TMDB_API_KEY.trim())+':'+kind+':';
  const key=scope+JSON.stringify(body);
  // Join only requests using the same cache instance (also keeps isolated tests deterministic).
  let active=pending.get(cache);if(!active){active=new Map();pending.set(cache,active);}
  if(active.has(key))return (await active.get(key)).clone();
  if(active.size>=64)throw new HttpError(429,'Muitas consultas simultâneas ao TMDB. Tente novamente em alguns segundos.');
  const store={get:key=>cache.get(scope+key,origin),put:(key,value,expires)=>cache.put(scope+key,value,expires,origin),take:()=>cache.take()};
  const work=(kind==='lookup'?lookupTmdb(upstreamRequest,env,fetcher,Date.now,store):detailMetadata(upstreamRequest,env,fetcher,store)).finally(()=>{active.delete(key);if(!active.size)pending.delete(cache);});
  active.set(key,work);return (await work).clone();
 }catch(error){return reply({error:error instanceof HttpError?error.message:'Metadados indisponíveis no momento.'},error instanceof HttpError?error.status:503);}
}
