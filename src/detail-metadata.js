import {bodyJson,HttpError,reply} from './account-security.js';
const validId=value=>Number.isSafeInteger(value)&&value>0&&value<=999999999;
export function sanitizeCollection(data,id){
 if(data?.id!==id)throw new Error('Invalid collection');
 return (Array.isArray(data.parts)?data.parts:[]).filter(row=>validId(row.id)&&row.adult!==true).slice(0,100).map(row=>({id:row.id,title:clean(row.title,240),year:clean(row.release_date,4),...(image(row.poster_path)?{poster:image(row.poster_path)}:{})}));
}
const image=(value,size='w500')=>typeof value==='string'&&/^\/[a-zA-Z0-9_.-]{2,100}$/.test(value)?'https://image.tmdb.org/t/p/'+size+value:null;
const number=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
const rows=value=>Array.isArray(value)?value:[];
const clean=(value,max)=>typeof value==='string'?value.slice(0,max):'';
export function sanitizeDetails(data,type,id){
 if(data?.id!==id||data.adult===true)throw new HttpError(404,'Metadados indisponíveis.');
 const trailer=(data.videos?.results||[]).find(row=>row.official===true&&row.site==='YouTube'&&row.type==='Trailer'&&/^[\w-]{11}$/.test(row.key));
 const releases=data.release_dates?.results?.find(row=>row.iso_3166_1==='BR')?.release_dates||[];
 const certification=type==='movie'?releases.find(row=>row.certification)?.certification:data.content_ratings?.results?.find(row=>row.iso_3166_1==='BR')?.rating;
 return {
  tmdbId:id,type,certification:clean(certification,16),
  title:clean(data.title||data.name,240),originalTitle:clean(data.original_title||data.original_name,240),
  overview:clean(data.overview,5000),tagline:clean(data.tagline,400),
  poster:image(data.poster_path),backdrop:image(data.backdrop_path,'w1280'),
  releaseDate:clean(data.release_date||data.first_air_date,10),lastAirDate:clean(data.last_air_date,10),
  runtime:number(data.runtime)||number(rows(data.episode_run_time)[0]),
  rating:number(data.vote_average),voteCount:number(data.vote_count),popularity:number(data.popularity),
  status:clean(data.status,80),originalLanguage:clean(data.original_language,16),
  budget:number(data.budget),revenue:number(data.revenue),
  genres:rows(data.genres).slice(0,20).map(row=>clean(row.name,80)).filter(Boolean),
  companies:rows(data.production_companies).slice(0,20).map(row=>({name:clean(row.name,120),logo:image(row.logo_path),country:clean(row.origin_country,8)})),
  countries:rows(data.production_countries).slice(0,20).map(row=>clean(row.name,100)),
  languages:rows(data.spoken_languages).slice(0,20).map(row=>clean(row.name||row.english_name,100)),
  networks:rows(data.networks).slice(0,20).map(row=>({name:clean(row.name,100),logo:image(row.logo_path)})),
  seasonCount:number(data.number_of_seasons),episodeCount:number(data.number_of_episodes),
  seasons:rows(data.seasons).slice(0,100).map(row=>({number:number(row.season_number),name:clean(row.name,120),overview:clean(row.overview,2000),episodes:number(row.episode_count),date:clean(row.air_date,10),poster:image(row.poster_path)})),
  keywords:rows(type==='movie'?data.keywords?.keywords:data.keywords?.results).slice(0,30).map(row=>clean(row.name,100)),
  crew:rows(data.credits?.crew).filter(row=>['Director','Screenplay','Writer','Novel','Original Music Composer','Director of Photography','Producer','Executive Producer'].includes(row.job)).slice(0,40).map(row=>({name:clean(row.name,100),job:clean(row.job,80)})),
  videos:rows(data.videos?.results).filter(row=>row.site==='YouTube'&&/^[\w-]{11}$/.test(row.key)).slice(0,10).map(row=>({name:clean(row.name,160),type:clean(row.type,40),official:row.official===true,url:'https://www.youtube.com/watch?v='+row.key})),
  images:{posters:rows(data.images?.posters).slice(0,12).map(row=>image(row.file_path)).filter(Boolean),backdrops:rows(data.images?.backdrops).slice(0,12).map(row=>image(row.file_path,'w780')).filter(Boolean)},
  reviews:rows(data.reviews?.results).slice(0,5).map(row=>({author:clean(row.author,100),content:clean(row.content,3000),rating:number(row.author_details?.rating)})),
  tmdbUrl:'https://www.themoviedb.org/'+type+'/'+id,

  cast:(data.credits?.cast||[]).slice(0,40).map(row=>({name:clean(row.name,100),character:clean(row.character,100),photo:image(row.profile_path)})),
  directors:(data.credits?.crew||[]).filter(row=>row.job==='Director').slice(0,4).map(row=>clean(row.name,100)),
  creators:(data.created_by||[]).slice(0,4).map(row=>clean(row.name,100)),
  trailer:trailer?'https://www.youtube.com/watch?v='+trailer.key:null,
  collection:type==='movie'&&validId(data.belongs_to_collection?.id)?{id:data.belongs_to_collection.id,name:clean(data.belongs_to_collection.name,150)}:null,
  similar:(data.recommendations?.results||[]).filter(row=>row.adult!==true).slice(0,20).map(row=>({id:row.id,title:clean(row.title||row.name,240),year:clean(row.release_date||row.first_air_date,4),...(image(row.poster_path)?{poster:image(row.poster_path)}:{})}))
 };
}
export async function detailMetadata(request,env,fetcher=fetch){
 try{
  if(request.method!=='POST')throw new HttpError(405,'Método não permitido.');
  const body=await bodyJson(request,500),id=Number(body.tmdbId),type=body.type;
  if(!['movie','tv'].includes(type)||!Number.isSafeInteger(id)||id<1||id>999999999)throw new HttpError(400,'Identificador inválido.');
  if(!env.TMDB_API_KEY?.trim()||!env.DB?.prepare)throw new HttpError(503,'TMDB indisponível.');
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS detail_metadata_cache (id TEXT PRIMARY KEY,payload TEXT NOT NULL,expires_at INTEGER NOT NULL)').run();
  const key='v4:'+type+':'+id,cached=await env.DB.prepare('SELECT payload FROM detail_metadata_cache WHERE id=? AND expires_at>?').bind(key,Date.now()).first();
  if(cached)return reply(JSON.parse(cached.payload));
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS detail_metadata_daily (day TEXT PRIMARY KEY,used INTEGER NOT NULL DEFAULT 0)').run();
  const quota=await env.DB.prepare('INSERT INTO detail_metadata_daily(day,used) VALUES (?,1) ON CONFLICT(day) DO UPDATE SET used=used+1 WHERE used<5000').bind(new Date().toISOString().slice(0,10)).run();
  if(!quota.meta.changes)throw new HttpError(429,'Limite diário de detalhes atingido.');
  const url=new URL('https://api.themoviedb.org/3/'+type+'/'+id);
  url.searchParams.set('api_key',env.TMDB_API_KEY.trim());url.searchParams.set('language','pt-BR');
  url.searchParams.set('append_to_response','credits,videos,recommendations,images,keywords,reviews,'+(type==='movie'?'release_dates':'content_ratings'));
  url.searchParams.set('include_image_language','pt,en,null');
  const signal=AbortSignal.timeout(7000);
  const response=await fetcher(url.href,{redirect:'manual',signal,headers:{accept:'application/json'}});
  if(!response.ok)throw new HttpError(503,'Detalhes indisponíveis no momento.');
  const result=sanitizeDetails(await response.json(),type,id);
  if(result.collection){
   result.collection.status='unavailable';result.collection.parts=[];
   try{
    const collectionUrl=new URL('https://api.themoviedb.org/3/collection/'+result.collection.id);
    collectionUrl.searchParams.set('api_key',env.TMDB_API_KEY.trim());collectionUrl.searchParams.set('language','pt-BR');
    const response=await fetcher(collectionUrl.href,{redirect:'manual',signal,headers:{accept:'application/json'}});
    if(response.ok){result.collection.parts=sanitizeCollection(await response.json(),result.collection.id);result.collection.status='ready'}
   }catch{/* Partial metadata remains usable when collection lookup fails. */}
  }
  await env.DB.prepare('INSERT INTO detail_metadata_cache(id,payload,expires_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at').bind(key,JSON.stringify(result),Date.now()+(result.collection?.status==='unavailable'?300000:604800000)).run();
  return reply(result);
 }catch(error){return reply({error:error instanceof HttpError?error.message:'Detalhes indisponíveis.'},error instanceof HttpError?error.status:503)}
}
