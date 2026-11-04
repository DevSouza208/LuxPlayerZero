import {imageKey,tmdbImageSource} from './vod-image-policy.js';
/** Image-only endpoint. Never exposes private playlists, TMDB API key, or arbitrary fetch proxy. */
export async function serveCachedArtwork(request,env,params){
 if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405});
 const type=params?.type,id=Number(params?.id),kind=params?.kind;
 const key=imageKey(type,id,kind);
 if(!key)return new Response('Not found',{status:404,headers:{'cache-control':'no-store'}});
 const headers={'x-content-type-options':'nosniff','referrer-policy':'no-referrer','access-control-allow-origin':'*'};
 try{
  const obj=await env.CATALOG_BUCKET?.get(key);
  if(obj){
   headers['content-type']='image/webp';
   headers['cache-control']='public, max-age=86400';
   headers['etag']=obj.httpEtag||obj.etag||'';
   return new Response(request.method==='HEAD'?null:obj.body,{status:200,headers});
  }
 }catch{return new Response('Storage unavailable',{status:503,headers:{'cache-control':'no-store'}})}
 // During backfill keep the official image visible. Only allow prevalidated TMDB CDN paths.
 let source=tmdbImageSource(new URL(request.url).searchParams.get('src'),kind);
 if(!source&&env.DB?.prepare){
  try{
   const row=await env.DB.prepare('SELECT source_url FROM vod_image_jobs WHERE tipo=? AND tmdb_id=? AND kind=?').bind(type,id,kind).first();
   source=tmdbImageSource(row?.source_url,kind);
  }catch{/* Cache can be in flight before schema initialization. */}
 }
 if(source)return new Response(null,{status:302,headers:{...headers,location:source,'cache-control':'public, max-age=90'}});
 return new Response('Not found',{status:404,headers:{...headers,'cache-control':'public, max-age=60'}});
}
