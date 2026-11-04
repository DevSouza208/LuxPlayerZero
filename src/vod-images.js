import {IMAGE_BUDGET,imageBudgetAllows,imageKey,tmdbImageSource} from './vod-image-policy.js';

const SCHEMA=[
 "CREATE TABLE IF NOT EXISTS vod_image_jobs(tipo TEXT NOT NULL CHECK(tipo IN ('movie','tv')),tmdb_id INTEGER NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('poster','backdrop')),source_url TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',r2_key TEXT,bytes INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,retry_at INTEGER NOT NULL DEFAULT 0,lease_until INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(tipo,tmdb_id,kind))",
 "CREATE INDEX IF NOT EXISTS vod_image_next ON vod_image_jobs(status,retry_at,lease_until,updated_at)",
 "CREATE TABLE IF NOT EXISTS vod_image_budget(period TEXT PRIMARY KEY,conversions INTEGER NOT NULL DEFAULT 0,bytes INTEGER NOT NULL DEFAULT 0,processing_ms INTEGER NOT NULL DEFAULT 0)"
];
const initialized=new WeakMap();
export async function ensureImageSchema(db){
 if(initialized.has(db))return initialized.get(db);
 const promise=(async()=>{for(const sql of SCHEMA)await db.prepare(sql).run()})();
 initialized.set(db,promise);
 try{await promise}catch(error){initialized.delete(db);throw error}
}
const TYPES={filmes:'movie',series:'tv'};
export async function queueImageMatch(env,{type,tmdbId,poster,backdrop,now=Date.now()}){
 if(!env.DB?.prepare||!['movie','tv'].includes(type)||!Number.isSafeInteger(tmdbId)||tmdbId<1)return 0;
 await ensureImageSchema(env.DB);
 let added=0;
 for(const [kind,source] of [['poster',poster],['backdrop',backdrop]]){
  const url=tmdbImageSource(source,kind);
  if(!url)continue;
  const res=await env.DB.prepare(
   "INSERT INTO vod_image_jobs(tipo,tmdb_id,kind,source_url,status,updated_at) VALUES(?,?,?,?,'pending',?)"+
   " ON CONFLICT(tipo,tmdb_id,kind) DO UPDATE SET source_url=excluded.source_url,status='pending',retry_at=0,attempts=0,updated_at=excluded.updated_at"+
   " WHERE vod_image_jobs.source_url<>excluded.source_url"
  ).bind(type,tmdbId,kind,url,now).run();
  added+=Number(res?.meta?.changes||0);
 }
 return added;
}
/** Old matches are discovered incrementally without re-enriching TMDB or resetting the index. */
export async function backfillImageQueue(env,{now=Date.now(),perKind=16}={}){
 await ensureImageSchema(env.DB);
 let queued=0;
 for(const [table,type] of Object.entries(TYPES))for(const [kind,column,originalSize] of [['poster','capa','w500'],['backdrop','fundo','w1280']]){
  const result=await env.DB.prepare(
   "INSERT OR IGNORE INTO vod_image_jobs(tipo,tmdb_id,kind,source_url,status,updated_at)"+
   " SELECT ?,t.tmdb_id,?,t."+column+",'pending',? FROM "+table+" t"+
   " WHERE t.tmdb_id IS NOT NULL AND t.tmdb_id>0 AND t."+column+" LIKE ?"+
   " AND NOT EXISTS(SELECT 1 FROM vod_image_jobs j WHERE j.tipo=? AND j.tmdb_id=t.tmdb_id AND j.kind=?)"+
   " ORDER BY t.metadados_em DESC LIMIT ?"
  ).bind(type,kind,now,'https://image.tmdb.org/t/p/'+originalSize+'/%',type,kind,perKind).run();
  queued+=Number(result?.meta?.changes||0);
 }
 return queued;
}
const monthKey=now=>new Date(now).toISOString().slice(0,7);
const dayKey=now=>new Date(now).toISOString().slice(0,10);
async function usage(db,period){return await db.prepare('SELECT * FROM vod_image_budget WHERE period=?').bind(period).first()||null;}
async function debit(db,period,bytes,ms){
 await db.prepare('INSERT INTO vod_image_budget(period,conversions,bytes,processing_ms) VALUES(?,1,?,?) ON CONFLICT(period) DO UPDATE SET conversions=conversions+1,bytes=bytes+excluded.bytes,processing_ms=processing_ms+excluded.processing_ms').bind(period,bytes,ms).run();
}
export async function imageQueueStatus(env,now=Date.now()){
 await ensureImageSchema(env.DB);
 const counts=await env.DB.prepare('SELECT status,COUNT(*) AS n FROM vod_image_jobs GROUP BY status').all();
 return {counts:counts.results||[],month:await usage(env.DB,monthKey(now)),day:await usage(env.DB,dayKey(now)),limits:IMAGE_BUDGET};
}
export async function processImageQueue(env,{now=Date.now(),fetcher=fetch,convert=null,limit=2}={}){
 if(!env.DB?.prepare||!env.CATALOG_BUCKET?.put||!env.CATALOG_BUCKET?.head)return {paused:true,reason:'R2 ou D1 indisponivel'};
 await ensureImageSchema(env.DB);
 const lease=now+120000;
 const acquired=await env.DB.prepare(
  "INSERT INTO vod_catalog_state(id,value) VALUES('image_lease',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value WHERE CAST(vod_catalog_state.value AS INTEGER)<=?"
 ).bind(String(lease),now).run();
 if(!acquired?.meta?.changes)return {busy:true,converted:0};
 let converted=0,failed=0,queued=0,paused=false,reason='';
 const month=monthKey(now),day=dayKey(now);
 try{
  const firstMonth=await usage(env.DB,month),firstDay=await usage(env.DB,day);
  if(!imageBudgetAllows(firstMonth,firstDay)){
   return {converted:0,paused:true,reason:'Limite gratuito conservador de imagens atingido'};
  }
  queued=await backfillImageQueue(env,{now});
  for(let i=0;i<Math.min(4,Math.max(0,limit));i++){
   const currentMonth=await usage(env.DB,month),currentDay=await usage(env.DB,day);
   if(!imageBudgetAllows(currentMonth,currentDay)){paused=true;reason='Orcamento de imagens atingido';break;}
   const row=await env.DB.prepare(
    "SELECT tipo,tmdb_id,kind,source_url,attempts FROM vod_image_jobs WHERE status IN ('pending','failed') AND retry_at<=? AND lease_until<=? ORDER BY updated_at,tipo,tmdb_id,kind LIMIT 1"
   ).bind(now,now).first();
   if(!row)break;
   const source=tmdbImageSource(row.source_url,row.kind),key=imageKey(row.tipo,row.tmdb_id,row.kind);
   if(!source||!key){
    await env.DB.prepare("UPDATE vod_image_jobs SET status='failed',retry_at=?,updated_at=? WHERE tipo=? AND tmdb_id=? AND kind=?").bind(now+7*86400000,now,row.tipo,row.tmdb_id,row.kind).run();
    failed++;continue;
   }
   const got=await env.DB.prepare("UPDATE vod_image_jobs SET lease_until=?,status='processing' WHERE tipo=? AND tmdb_id=? AND kind=? AND status IN ('pending','failed') AND lease_until<=?").bind(lease,row.tipo,row.tmdb_id,row.kind,now).run();
   if(!got?.meta?.changes)continue;
   const start=performance.now();
   try{
    // A previous attempt may have uploaded R2 before recording success in D1.
    const existing=await env.CATALOG_BUCKET.head(key);
    let bytes=0;
    if(!existing){
     const response=await fetcher(source,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{accept:'image/jpeg,image/png'}});
     if(!response.ok||response.status>=300||Number(response.headers.get('content-length')||0)>IMAGE_BUDGET.maxSourceBytes)throw Error('Origem TMDB indisponivel ou grande demais');
     const input=await response.arrayBuffer();
     if(input.byteLength>IMAGE_BUDGET.maxSourceBytes)throw Error('Origem grande demais');
     if(!convert)({toWebp:convert}=await import('./image-webp-codec.js'));
     const webp=await convert(input,{quality:row.kind==='poster'?80:76});
     bytes=webp.byteLength;
     if(bytes<24||bytes>IMAGE_BUDGET.maxBytesPerImage)throw Error('Imagem convertida excede o limite');
     const elapsed=Math.max(1,Math.ceil(performance.now()-start));
     if(!imageBudgetAllows(await usage(env.DB,month),await usage(env.DB,day),bytes)||elapsed>60000) {
       paused=true;reason='Limite de processamento ou armazenamento de imagens';break;
     }
     await env.CATALOG_BUCKET.put(key,webp,{httpMetadata:{contentType:'image/webp',cacheControl:'public, max-age=86400'},customMetadata:{source:'tmdb',kind:row.kind}});
     // Charged only after a successful put; includes fetch and encode wall time.
     await debit(env.DB,month,bytes,elapsed);
     await debit(env.DB,day,bytes,elapsed);
    }
    await env.DB.prepare("UPDATE vod_image_jobs SET status='ready',r2_key=?,bytes=?,retry_at=0,lease_until=0,updated_at=? WHERE tipo=? AND tmdb_id=? AND kind=? AND source_url=? AND lease_until=?")
      .bind(key,existing?.size||bytes,now,row.tipo,row.tmdb_id,row.kind,source,lease).run();
    converted++;
   }catch(error){
    failed++;
    const attempts=row.attempts+1;
    await env.DB.prepare("UPDATE vod_image_jobs SET status='failed',attempts=?,retry_at=?,lease_until=0,updated_at=? WHERE tipo=? AND tmdb_id=? AND kind=? AND lease_until=?").bind(attempts,now+(attempts>=5?86400000:3600000),now,row.tipo,row.tmdb_id,row.kind,lease).run();
   }finally{
    // Cover early budget stop and retries without leaving a processing row stuck.
    await env.DB.prepare("UPDATE vod_image_jobs SET status='pending',lease_until=0,updated_at=? WHERE tipo=? AND tmdb_id=? AND kind=? AND lease_until=? AND status='processing'").bind(now,row.tipo,row.tmdb_id,row.kind,lease).run();
   }
   if(paused)break;
  }
  return {converted,failed,queued,paused,reason};
 }finally{
  await env.DB.prepare("UPDATE vod_catalog_state SET value='0' WHERE id='image_lease' AND value=?").bind(String(lease)).run();
 }
}
