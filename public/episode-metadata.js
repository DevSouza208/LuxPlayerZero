// Metadata is presentation only: never modify provider entries or media URLs.
export function episodePresentation(row,metadata){
 const episode=metadata?.episodes?.find(e=>e.season===row.season&&e.number===row.number);
 const bits=['T'+row.season+':E'+row.number];
 if(episode?.runtime>0)bits.push(episode.runtime+' min');
 if(episode?.airDate&&/^\d{4}-\d{2}-\d{2}$/.test(episode.airDate))bits.push(episode.airDate.split('-').reverse().join('/'));
 if(episode?.rating>0&&episode?.voteCount>0)bits.push('★ '+episode.rating.toFixed(1));
 return {title:episode?.title||row.title||'Episódio '+row.number,info:bits.join(' · '),overview:episode?.overview||'',still:episode?.still||null};
}
export function createSeasonMetadataClient({fetcher=fetch,now=Date.now}={}){
 const cache=new Map(),pending=new Map();
 return async function seasonFor(id,season){
  if(!Number.isSafeInteger(id)||id<1||id>999999999||!Number.isInteger(season)||season<0||season>99)return null;
  const key=id+':'+season,hit=cache.get(key);
  if(hit&&hit.expires>now())return hit.value;
  if(pending.has(key))return pending.get(key);
  const promise=(async()=>{
   let value=null;
   try{
    const response=await fetcher('/api/metadata/details',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({tmdbId:id,type:'tv',seasonNumber:season}),signal:AbortSignal.timeout(10000)});
    const data=response.ok?await response.json():null;
    if(data?.tmdbId===id&&data.seasonNumber===season&&Array.isArray(data.episodes))value=data;
   }catch{/* Retain provider labels and allow a later retry. */}
   cache.delete(key);cache.set(key,{value,expires:now()+(value?86400000:30000)});
   if(cache.size>128)cache.delete(cache.keys().next().value);
   return value;
  })().finally(()=>pending.delete(key));
  pending.set(key,promise);return promise;
 };
}
