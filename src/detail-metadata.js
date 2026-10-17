import {requiredSession,bodyJson,HttpError,reply,limit} from './account-security.js';
const validId=value=>Number.isSafeInteger(value)&&value>0&&value<=999999999;
export function sanitizeCollection(data,id){
 if(data?.id!==id)throw new Error('Invalid collection');
 return (Array.isArray(data.parts)?data.parts:[]).filter(row=>validId(row.id)&&row.adult!==true).slice(0,100).map(row=>({id:row.id,title:clean(row.title,240),year:clean(row.release_date,4)}));
}
const clean=(value,max)=>typeof value==='string'?value.slice(0,max):'';
export function sanitizeDetails(data,type,id){
 if(data?.id!==id||data.adult===true)throw new HttpError(404,'Metadados indisponíveis.');
 const trailer=(data.videos?.results||[]).find(row=>row.official===true&&row.site==='YouTube'&&row.type==='Trailer'&&/^[\w-]{11}$/.test(row.key));
 const releases=data.release_dates?.results?.find(row=>row.iso_3166_1==='BR')?.release_dates||[];
 const certification=type==='movie'?releases.find(row=>row.certification)?.certification:data.content_ratings?.results?.find(row=>row.iso_3166_1==='BR')?.rating;
 return {
  tmdbId:id,type,certification:clean(certification,16),
  cast:(data.credits?.cast||[]).slice(0,12).map(row=>({name:clean(row.name,100),character:clean(row.character,100)})),
  directors:(data.credits?.crew||[]).filter(row=>row.job==='Director').slice(0,4).map(row=>clean(row.name,100)),
  creators:(data.created_by||[]).slice(0,4).map(row=>clean(row.name,100)),
  trailer:trailer?'https://www.youtube.com/watch?v='+trailer.key:null,
  collection:type==='movie'&&validId(data.belongs_to_collection?.id)?{id:data.belongs_to_collection.id,name:clean(data.belongs_to_collection.name,150)}:null,
  similar:(data.recommendations?.results||[]).filter(row=>row.adult!==true).slice(0,20).map(row=>({id:row.id,title:clean(row.title||row.name,240),year:clean(row.release_date||row.first_air_date,4)}))
 };
}
export async function detailMetadata(request,env,fetcher=fetch){
 try{
  const user=await requiredSession(request,env);
  if(request.method!=='POST')throw new HttpError(405,'Método não permitido.');
  const body=await bodyJson(request,500),id=Number(body.tmdbId),type=body.type;
  if(!['movie','tv'].includes(type)||!Number.isSafeInteger(id)||id<1||id>999999999)throw new HttpError(400,'Identificador inválido.');
  if(!env.TMDB_API_KEY)throw new HttpError(503,'TMDB indisponível.');
  const key='v2:'+type+':'+id,cached=await env.DB.prepare('SELECT payload FROM detail_metadata_cache WHERE id=? AND expires_at>?').bind(key,Date.now()).first();
  if(cached)return reply(JSON.parse(cached.payload));
  await limit(env,'details:'+user.user_id,20);
  const url=new URL('https://api.themoviedb.org/3/'+type+'/'+id);
  url.searchParams.set('api_key',env.TMDB_API_KEY);url.searchParams.set('language','pt-BR');
  url.searchParams.set('append_to_response','credits,videos,recommendations,'+(type==='movie'?'release_dates':'content_ratings'));
  const signal=AbortSignal.timeout(7000);
  const response=await fetcher(url.href,{redirect:'error',signal,headers:{accept:'application/json'}});
  if(!response.ok)throw new HttpError(503,'Detalhes indisponíveis no momento.');
  const result=sanitizeDetails(await response.json(),type,id);
  if(result.collection){
   result.collection.status='unavailable';result.collection.parts=[];
   try{
    const collectionUrl=new URL('https://api.themoviedb.org/3/collection/'+result.collection.id);
    collectionUrl.searchParams.set('api_key',env.TMDB_API_KEY);collectionUrl.searchParams.set('language','pt-BR');
    const response=await fetcher(collectionUrl.href,{redirect:'error',signal,headers:{accept:'application/json'}});
    if(response.ok){result.collection.parts=sanitizeCollection(await response.json(),result.collection.id);result.collection.status='ready'}
   }catch{/* Partial metadata remains usable when collection lookup fails. */}
  }
  await env.DB.prepare('INSERT INTO detail_metadata_cache(id,payload,expires_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at').bind(key,JSON.stringify(result),Date.now()+(result.collection?.status==='unavailable'?300000:86400000)).run();
  return reply(result);
 }catch(error){return reply({error:error instanceof HttpError?error.message:'Detalhes indisponíveis.'},error instanceof HttpError?error.status:503)}
}
