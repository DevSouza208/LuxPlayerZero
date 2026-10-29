import {bodyJson,HttpError,reply} from './account-security.js';
import {ensureVodSchema} from './vod-schema.js';
import {normalizeSearchText} from '../public/media-taxonomy.js';
import {cleanHighlights,highlightDay} from '../public/daily-highlights-model.js';
const ROOT='editorial/daily-highlights-v1/',DRAFT=ROOT+'draft.json',LIVE=ROOT+'published.json',REFRESH=ROOT+'refresh.json',RETRY=ROOT+'retry.json';
const read=async(env,key)=>{const object=await env.CATALOG_BUCKET.get(key);return object?object.json():null};
const write=(env,key,data)=>env.CATALOG_BUCKET.put(key,JSON.stringify(data),{httpMetadata:{contentType:'application/json',cacheControl:'private, no-store'}});
export async function markHighlightsRefresh(env,now=Date.now()){
 await write(env,REFRESH,{day:highlightDay(now),updatedAt:now});
}
async function readyCatalog(env){
 const {results=[]}=await env.DB.prepare(`SELECT c.catalog_id,j.status,j.generation FROM catalog_sources c LEFT JOIN vod_catalog_jobs j
 ON j.catalog_id=c.catalog_id AND j.snapshot_key=c.r2_key AND j.snapshot_time=c.synced_at`).all();
 if(!results.length||results.some(row=>row.status!=='ready'))throw new HttpError(409,'Aguarde a atualização da lista terminar para preparar os destaques.');
 return JSON.stringify(results.sort((a,b)=>a.catalog_id.localeCompare(b.catalog_id)));
}
/** Consultas limitadas a candidatos do ranking, com índices; nunca enriquece todo o catálogo. */
export async function matchHighlight(env,table,candidate){
 const active=`EXISTS(SELECT 1 FROM vod_catalog_items i JOIN vod_catalog_jobs j ON j.catalog_id=i.catalog_id AND j.generation=i.generation
 JOIN catalog_sources c ON c.catalog_id=j.catalog_id AND c.r2_key=j.snapshot_key AND c.synced_at=j.snapshot_time
 WHERE i.tipo=? AND i.item_id=t.id AND j.status='ready')`;
 const names=[...new Set([candidate.title||candidate.name,candidate.original_title||candidate.original_name].filter(Boolean).map(normalizeSearchText))];
 const year=Number((candidate.release_date||candidate.first_air_date||'').slice(0,4));
 let row=await env.DB.prepare(`SELECT t.id,t.ano FROM ${table} t WHERE t.tmdb_id=? AND ${active} ORDER BY t.id LIMIT 1`).bind(candidate.id,table).first();
 if(!row&&year>=1900&&names.length){
  const {results=[]}=await env.DB.prepare(`SELECT t.id,t.ano FROM ${table} t WHERE t.titulo_normalizado IN (${names.map(()=>'?').join(',')})
   AND t.ano=? AND (t.tmdb_id IS NULL OR t.tmdb_id=?) AND ${active} ORDER BY t.id LIMIT 2`).bind(...names,year,candidate.id,table).all();
  if(results.length===1)row=results[0];
 }
 if(!row)return null;
 const image=(path,size)=>typeof path==='string'&&/^\/[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(path)?'https://image.tmdb.org/t/p/'+size+path:'';
 return {catalogId:row.id,tmdbId:candidate.id,title:candidate.title||candidate.name,year:row.ano,poster:image(candidate.poster_path,'w500'),backdrop:image(candidate.backdrop_path,'w1280'),overview:candidate.overview||''};
}
const preparing=new WeakMap();
export async function prepareHighlights(env,{now=Date.now(),fetcher=fetch,scheduled=false}={}){
 if(!env.CATALOG_BUCKET?.get||!env.CATALOG_BUCKET?.put||!env.DB?.prepare)throw new HttpError(503,'Destaques indisponíveis: confira DB e CATALOG_BUCKET.');
 if(preparing.has(env))return preparing.get(env);
 const work=(async()=>{
  const day=highlightDay(now),draft=await read(env,DRAFT);
  if(draft?.day===day&&(scheduled||draft.catalogGeneration===await readyCatalog(env)))return cleanHighlights(draft);
  if(scheduled){const refreshed=await read(env,REFRESH);if(refreshed?.day!==day)return null;}
  const retry=await read(env,RETRY);if(retry?.after>now)throw new HttpError(429,'A preparação falhou recentemente. Tente novamente mais tarde.');
  if(!env.TMDB_API_KEY?.trim())throw new HttpError(503,'TMDB não configurado neste servidor.');
  await ensureVodSchema(env.DB);const generation=await readyCatalog(env);
  const selection={version:1,id:crypto.randomUUID(),day,createdAt:now,movies:[],series:[]};
  try{
   for(const [role,type,table]of [['movies','movie','filmes'],['series','tv','series']]){
    const seen=new Set();
    // No máximo 3 páginas (60 candidatos) por tipo; para assim que encontra 6.
    for(let page=1;page<=3&&selection[role].length<6;page++){
     const url=new URL('https://api.themoviedb.org/3/trending/'+type+'/day');url.searchParams.set('language','pt-BR');url.searchParams.set('page',String(page));url.searchParams.set('api_key',env.TMDB_API_KEY.trim());
     const response=await fetcher(url,{signal:AbortSignal.timeout(8000),redirect:'error'});
     if(!response.ok)throw Error('TMDB indisponível');
     const data=await response.json();if(!Array.isArray(data.results))throw Error('Resposta TMDB inválida');
     for(const candidate of data.results.slice(0,20)){
      if(!Number.isSafeInteger(candidate?.id)||candidate.id<1||candidate.adult===true||seen.has(candidate.id))continue;seen.add(candidate.id);
      const match=await matchHighlight(env,table,candidate);if(match)selection[role].push(match);if(selection[role].length===6)break;
     }
     if(page>=Number(data.total_pages||1))break;
    }
   }
   // Não aceita uma lista que mudou enquanto consultávamos as tendências.
   if(generation!==await readyCatalog(env))throw new HttpError(409,'A lista mudou durante a preparação. Tente novamente.');
   if(!selection.movies.length&&!selection.series.length)throw new HttpError(409,'Nenhuma tendência pôde ser confirmada no catálogo. Os destaques anteriores foram preservados.');
   const safe=cleanHighlights(selection);await write(env,DRAFT,{...safe,catalogGeneration:generation});return safe;
  }catch(error){await write(env,RETRY,{after:now+3600000});throw error;}
 })();preparing.set(env,work);try{return await work;}finally{preparing.delete(env);}
}
export async function dailyHighlightsApi(request,env,user){
 try{
  if(!user)throw new HttpError(401,'Entre novamente para continuar.');
  if(!['GET','POST'].includes(request.method))throw new HttpError(405,'Método não permitido.');
  if(!env.CATALOG_BUCKET?.get||!env.CATALOG_BUCKET?.put)throw new HttpError(503,'Destaques indisponíveis.');
  if(request.method==='GET'){const selection=await read(env,LIVE);return reply({selection:selection?cleanHighlights(selection):null});}
  if(user.role!=='admin')throw new HttpError(403,'Somente o administrador pode publicar destaques.');
  const body=await bodyJson(request,1000);
  if(body.action==='prepare')return reply({draft:await prepareHighlights(env)});
  if(body.action!=='publish')throw new HttpError(400,'Ação inválida.');
  const draft=await read(env,DRAFT);
  if(!draft||draft.id!==body.id||draft.day!==highlightDay(Date.now()))throw new HttpError(409,'A prévia mudou ou venceu. Prepare os destaques novamente.');
  if(draft.catalogGeneration!==await readyCatalog(env))throw new HttpError(409,'A lista mudou desde a prévia. Prepare os destaques novamente.');
  // Reconfere os vínculos após o tempo que o administrador passou na prévia.
  for(const [role,table]of [['movies','filmes'],['series','series']])for(const row of draft[role]){
   const active=await env.DB.prepare(`SELECT 1 FROM vod_catalog_items i JOIN vod_catalog_jobs j ON j.catalog_id=i.catalog_id AND j.generation=i.generation
    WHERE i.tipo=? AND i.item_id=? AND j.status='ready' LIMIT 1`).bind(table,row.catalogId).first();
   if(!active)throw new HttpError(409,'Um título saiu do catálogo. A publicação anterior foi preservada.');
  }
  const selection=cleanHighlights({...draft,publishedAt:Date.now()});await write(env,LIVE,selection);return reply({selection});
 }catch(error){return reply({error:error instanceof HttpError?error.message:'Não foi possível preparar os destaques. A seleção publicada foi preservada.'},error instanceof HttpError?error.status:503);}
}
