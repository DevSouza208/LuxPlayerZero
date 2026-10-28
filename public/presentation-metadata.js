import {createArtworkMetadataCache} from './artwork-metadata-cache.js';
/** Browser-only cache. Public TMDB metadata never depends on the catalog database. */
export function createPresentationMetadataClient({fetcher=fetch,now=Date.now,localCache=createArtworkMetadataCache(),timeout=15000}={}){
 const memory=new Map(),pending=new Map();
 function valid(body,data){return data?.tmdbId===body.tmdbId&&(body.seasonNumber!==undefined?data.seasonNumber===body.seasonNumber&&Array.isArray(data.episodes):data.type===body.type);}
 return async function metadata(body){
  if(!Number.isSafeInteger(body?.tmdbId)||body.tmdbId<1||body.tmdbId>999999999||!['movie','tv'].includes(body.type))return null;
  const isSeason=body.seasonNumber!==undefined;if(isSeason&&(body.type!=='tv'||!Number.isInteger(body.seasonNumber)||body.seasonNumber<0||body.seasonNumber>99))return null;
  const query={tmdbId:body.tmdbId,type:body.type,...(isSeason?{seasonNumber:body.seasonNumber}:{})};
  const key=(isSeason?'presentation:season-v2:':'presentation:v1:')+query.type+':'+query.tmdbId+':'+(isSeason?query.seasonNumber:'details'),hit=memory.get(key);
  if(hit?.expires>now())return hit.value;
  if(pending.has(key))return pending.get(key);
  const promise=(async()=>{
   try{
    const local=await localCache.get(key);
    if(local?.expires>now()&&valid(query,local.payload)){memory.delete(key);memory.set(key,{value:local.payload,expires:local.expires});if(memory.size>128)memory.delete(memory.keys().next().value);return local.payload;}
   }catch{/* Browser storage may be disabled. */}
   let value=null;
   try{const response=await fetcher('/api/metadata/details',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify(query),signal:AbortSignal.timeout(timeout)});const data=response.ok?await response.json():null;if(valid(query,data))value=data;}catch{/* Provider names remain usable. */}
   const expires=now()+(value?(isSeason?86400000:value.collection?.status==='unavailable'?300000:604800000):30000);
   memory.delete(key);memory.set(key,{value,expires});if(memory.size>128)memory.delete(memory.keys().next().value);
   if(value)try{await localCache.put(key,{status:'matched',payload:value,expires});}catch{/* Quota local never blocks the screen. */}
   return value;
  })().finally(()=>pending.delete(key));
  pending.set(key,promise);return promise;
 };
}
