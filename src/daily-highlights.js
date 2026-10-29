import {bodyJson,HttpError,reply} from './account-security.js';
import {ensureVodSchema} from './vod-schema.js';
import {vodFailure} from './vod-errors.js';
import {normalizeSearchText} from '../public/media-taxonomy.js';
import {cleanHighlights,highlightDay,HIGHLIGHT_LIMIT} from '../public/daily-highlights-model.js';
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
const failures={
 TMDB_RATE_LIMIT:'O TMDB limitou as consultas de tendências (HTTP 429).',
 TMDB_AUTH:'O TMDB recusou a chave deste servidor (HTTP 401/403). Confira TMDB_API_KEY no Pages e no Worker.',
 TMDB_HTTP:'O TMDB está indisponível para consultar tendências.',
 TMDB_RESPONSE:'O TMDB devolveu uma resposta de tendências inválida.',
 TMDB_NETWORK:'Não foi possível conectar ao TMDB a tempo para consultar as tendências.',
 D1_DAILY_READ_LIMIT:'O limite de leituras do D1 foi atingido.',
 D1_DAILY_WRITE_LIMIT:'O limite de gravações do D1 foi atingido.',
 D1_REQUEST_LIMIT:'A conferência atingiu o limite de consultas por execução do D1.',
 D1_STORAGE_LIMIT:'O banco D1 atingiu o limite de armazenamento.',
 VOD_SCHEMA_MISMATCH:'A estrutura do catálogo no banco está incompleta ou desatualizada.',
 D1_TEMPORARY:'O D1 demorou para responder ou está temporariamente ocupado.',
 HIGHLIGHTS_CATALOG:'Falha ao conferir as tendências no catálogo D1.',
 HIGHLIGHTS_STORAGE:'Falha ao guardar a prévia no R2.'
};
function highlightError(code,{status=503,stage='unknown',retryAfter=60,upstreamStatus}={}){
 const error=new HttpError(status,(failures[code]||failures.HIGHLIGHTS_CATALOG)+' A seleção publicada foi preservada. Código: '+code+'.');
 return Object.assign(error,{code,stage,retryAfter,upstreamStatus});
}
function describeFailure(error,stage){
 if(error instanceof HttpError)return error;
 if(stage==='tmdb')return highlightError('TMDB_NETWORK',{stage});
 if(stage==='save')return highlightError('HIGHLIGHTS_STORAGE',{stage});
 const known=vodFailure(error,stage),code=failures[known.code]?known.code:'HIGHLIGHTS_CATALOG';
 return highlightError(code,{status:known.status,stage});
}
const preparing=new WeakMap();
export async function prepareHighlights(env,{now=Date.now(),fetcher=fetch,scheduled=false}={}){
 if(!env.CATALOG_BUCKET?.get||!env.CATALOG_BUCKET?.put||!env.DB?.prepare)throw new HttpError(503,'Destaques indisponíveis: confira DB e CATALOG_BUCKET.');
 if(preparing.has(env))return preparing.get(env);
 const work=(async()=>{
  const day=highlightDay(now),draft=await read(env,DRAFT);
  if(draft?.day===day&&draft.targetSize===HIGHLIGHT_LIMIT&&(scheduled||draft.catalogGeneration===await readyCatalog(env)))return cleanHighlights(draft);
  if(scheduled){const refreshed=await read(env,REFRESH);if(refreshed?.day!==day)return null;}
  const retry=await read(env,RETRY);
  // Registros antigos não guardavam a causa e bloqueavam até erros recuperáveis por uma hora.
  if(retry?.version===2&&retry.after>now&&failures[retry.code]){
   const seconds=Math.ceil((retry.after-now)/1000),error=highlightError(retry.code,{status:retry.status,stage:retry.stage,retryAfter:seconds,upstreamStatus:retry.upstreamStatus});
   error.message+=' Nova tentativa em '+seconds+' segundos.';throw error;
  }
  if(!env.TMDB_API_KEY?.trim())throw new HttpError(503,'TMDB não configurado neste servidor.');
  let stage='schema';
  const selection={version:1,id:crypto.randomUUID(),day,createdAt:now,movies:[],series:[]};
  try{
   await ensureVodSchema(env.DB);stage='catalog';const generation=await readyCatalog(env);
   for(const [role,type,table]of [['movies','movie','filmes'],['series','tv','series']]){
    const seen=new Set();
    // No máximo 3 páginas (60 candidatos) por tipo; para assim que encontra sete.
    for(let page=1;page<=3&&selection[role].length<HIGHLIGHT_LIMIT;page++){
     const url=new URL('https://api.themoviedb.org/3/trending/'+type+'/day');url.searchParams.set('language','pt-BR');url.searchParams.set('page',String(page));url.searchParams.set('api_key',env.TMDB_API_KEY.trim());
     // Workers aceita manual/follow; redirect:error lança TypeError antes da rede.
     stage='tmdb';const response=await fetcher(url.href,{method:'GET',signal:AbortSignal.timeout(8000),redirect:'manual',headers:{accept:'application/json'}});
     if(!response.ok){
      const code=response.status===429?'TMDB_RATE_LIMIT':[401,403].includes(response.status)?'TMDB_AUTH':'TMDB_HTTP';
      const seconds=Number(response.headers.get('retry-after'));
      throw highlightError(code,{status:response.status===429?429:503,stage,upstreamStatus:response.status,retryAfter:response.status===429&&Number.isFinite(seconds)?Math.max(60,Math.min(3600,seconds)):60});
     }
     const data=await response.json().catch(()=>null);if(!Array.isArray(data?.results))throw highlightError('TMDB_RESPONSE',{stage,status:502});
     stage='catalog';
     for(const candidate of data.results.slice(0,20)){
      if(!Number.isSafeInteger(candidate?.id)||candidate.id<1||candidate.adult===true||seen.has(candidate.id))continue;seen.add(candidate.id);
      const match=await matchHighlight(env,table,candidate);if(match)selection[role].push(match);if(selection[role].length===HIGHLIGHT_LIMIT)break;
     }
     if(page>=Number(data.total_pages||1))break;
    }
   }
   // Não aceita uma lista que mudou enquanto consultávamos as tendências.
   stage='catalog';if(generation!==await readyCatalog(env))throw new HttpError(409,'A lista mudou durante a preparação. Tente novamente.');
   if(!selection.movies.length&&!selection.series.length)throw new HttpError(409,'Nenhuma tendência pôde ser confirmada no catálogo. Os destaques anteriores foram preservados.');
   const safe=cleanHighlights(selection);stage='save';await write(env,DRAFT,{...safe,targetSize:HIGHLIGHT_LIMIT,catalogGeneration:generation});return safe;
  }catch(error){
   const failure=describeFailure(error,stage);
   if(failure.retryAfter){
    await write(env,RETRY,{version:2,after:now+failure.retryAfter*1000,code:failure.code,status:failure.status,stage:failure.stage,upstreamStatus:failure.upstreamStatus}).catch(()=>{});
   }
   // Somente códigos/etapas: nunca registrar o erro bruto com SQL, URL ou chave.
   console.warn('daily_highlights_failure',{code:failure.code||'CATALOG_CHANGED_OR_EMPTY',stage:failure.stage||stage,upstreamStatus:failure.upstreamStatus});
   throw failure;
  }
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
 }catch(error){
  const failure=describeFailure(error,'prepare');
  const response=reply({error:failure.message,code:failure.code,stage:failure.stage,upstreamStatus:failure.upstreamStatus,retryAfter:failure.retryAfter},failure.status);
  if(failure.retryAfter)response.headers.set('retry-after',String(failure.retryAfter));return response;
 }

}
