import {ensureVodSchema} from './vod-schema.js';
import {readVodChunk} from './vod-model.js';
import {lookupTmdb} from './tmdb-metadata.js';
import {validateQuery} from './tmdb-safe.js';
const TABLES=['filmes','series'],CHUNK=64*1024;
export async function writeVodRows(db,table,rows,now=Date.now()){
 if(!TABLES.includes(table))throw Error('Tipo inválido');
 if(!rows.length)return;
 // JSON permite gravar um lote com poucos parâmetros e sem uma query por título.
 await db.prepare(`INSERT INTO ${table}(id,titulo,titulo_normalizado,ano,nome_original,id_provedor,fornecedor,tags_fonte,criado_em,atualizado_em)
 SELECT json_extract(value,'$.id'),json_extract(value,'$.titulo'),json_extract(value,'$.titulo_normalizado'),
 json_extract(value,'$.ano'),json_extract(value,'$.nome_original'),json_extract(value,'$.id_provedor'),json_extract(value,'$.fornecedor'),json_extract(value,'$.tags_fonte'),?,? FROM json_each(?) WHERE 1
 ON CONFLICT(id) DO UPDATE SET tags_fonte=excluded.tags_fonte,id_provedor=COALESCE(${table}.id_provedor,excluded.id_provedor),fornecedor=COALESCE(${table}.fornecedor,excluded.fornecedor),atualizado_em=excluded.atualizado_em
 WHERE ${table}.tags_fonte<>excluded.tags_fonte OR (${table}.id_provedor IS NULL AND excluded.id_provedor IS NOT NULL)`).bind(now,now,JSON.stringify(rows)).run();
}
export async function startVodJobs(env,now=Date.now()){
 if(!env.DB?.prepare)throw Error('Configure DB no Worker.');
 await ensureVodSchema(env.DB);
 if(!await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='catalog_sources'").first())return 0;
 const sources=await env.DB.prepare('SELECT catalog_id,r2_key,synced_at FROM catalog_sources ORDER BY catalog_id').all();
 if(sources.results?.length&&!env.CATALOG_BUCKET?.get)throw Error('Configure CATALOG_BUCKET no Worker.');
 for(const source of sources.results||[]){
  await env.DB.prepare(`INSERT INTO vod_catalog_jobs(catalog_id,generation,snapshot_key,snapshot_time,updated_at)
   VALUES(?,?,?,?,?) ON CONFLICT(catalog_id) DO UPDATE SET generation=excluded.generation,snapshot_key=excluded.snapshot_key,
   snapshot_time=excluded.snapshot_time,cursor=0,entry_count=0,group_name='',status='building',lease_until=0,updated_at=excluded.updated_at
   WHERE vod_catalog_jobs.snapshot_key<>excluded.snapshot_key OR vod_catalog_jobs.snapshot_time<>excluded.snapshot_time OR vod_catalog_jobs.status IN ('failed','superseded')`)
   .bind(source.catalog_id,crypto.randomUUID(),source.r2_key,source.synced_at,now).run();
 }
 return (sources.results||[]).length;
}
export async function advanceVodJob(env,{chunks=1,now=Date.now()}={}){
 const job=await env.DB.prepare("SELECT * FROM vod_catalog_jobs WHERE status='building' AND lease_until<? ORDER BY updated_at,catalog_id LIMIT 1").bind(now).first();
 if(!job)return {status:'idle'};
 const lease=now+120000;
 const acquired=await env.DB.prepare("UPDATE vod_catalog_jobs SET lease_until=? WHERE catalog_id=? AND generation=? AND lease_until<? AND status='building'").bind(lease,job.catalog_id,job.generation,now).run();
 if(!acquired.meta.changes)return {status:'busy'};
 try{
  for(let step=0;step<Math.min(8,chunks);step++){
   const source=await env.DB.prepare('SELECT * FROM catalog_sources WHERE catalog_id=?').bind(job.catalog_id).first();
   if(!source||source.r2_key!==job.snapshot_key||source.synced_at!==job.snapshot_time){
    await env.DB.prepare("UPDATE vod_catalog_jobs SET status='superseded',lease_until=0 WHERE catalog_id=? AND generation=?").bind(job.catalog_id,job.generation).run();await startVodJobs(env,now);return {status:'superseded'};
   }
   const object=await env.CATALOG_BUCKET.get(job.snapshot_key,{range:{offset:job.cursor,length:CHUNK}});
   if(!object)throw Error('Snapshot indisponível');
   const bytes=new Uint8Array(await object.arrayBuffer());
   const parsed=readVodChunk(bytes,{group:job.group_name,final:job.cursor+bytes.length>=source.size_bytes});
   if(!parsed.consumed)throw Error('Trecho incompleto ou inválido');
   const cursor=job.cursor+parsed.consumed,count=job.entry_count+parsed.count,done=cursor>=source.size_bytes;
   if(done&&count!==source.item_count)throw Error('A contagem não confere com o snapshot');
   for(const table of TABLES)await writeVodRows(env.DB,table,parsed[table],now);
   const rows=[...parsed.filmes,...parsed.series].map(row=>({tipo:row.tipo,id:row.id,referencias:row.referencias}));
   const stmts=[];
   if(rows.length)stmts.push(env.DB.prepare(`INSERT INTO vod_catalog_items(catalog_id,tipo,item_id,generation,ids_provedor)
    SELECT ?,json_extract(value,'$.tipo'),json_extract(value,'$.id'),?,json_extract(value,'$.referencias') FROM json_each(?)
    WHERE EXISTS(SELECT 1 FROM vod_catalog_jobs j JOIN catalog_sources c ON c.catalog_id=j.catalog_id WHERE j.catalog_id=? AND j.generation=? AND j.lease_until=? AND c.r2_key=j.snapshot_key AND c.synced_at=j.snapshot_time)
    ON CONFLICT(catalog_id,tipo,item_id) DO UPDATE SET ids_provedor=CASE WHEN vod_catalog_items.generation=excluded.generation THEN
    (SELECT json_group_array(json(value)) FROM (SELECT value FROM json_each(vod_catalog_items.ids_provedor) UNION SELECT value FROM json_each(excluded.ids_provedor)))
    ELSE excluded.ids_provedor END,generation=excluded.generation`).bind(job.catalog_id,job.generation,JSON.stringify(rows),job.catalog_id,job.generation,lease));
   stmts.push(env.DB.prepare(`UPDATE vod_catalog_jobs SET cursor=?,entry_count=?,group_name=?,status=?,lease_until=?,updated_at=?
    WHERE catalog_id=? AND generation=? AND lease_until=? AND EXISTS(SELECT 1 FROM catalog_sources c WHERE c.catalog_id=vod_catalog_jobs.catalog_id AND c.r2_key=vod_catalog_jobs.snapshot_key AND c.synced_at=vod_catalog_jobs.snapshot_time)`).bind(cursor,count,parsed.group,done?'ready':'building',done?0:lease,now,job.catalog_id,job.generation,lease));
   if(done)stmts.push(env.DB.prepare("DELETE FROM vod_catalog_items WHERE catalog_id=? AND generation<>? AND EXISTS(SELECT 1 FROM vod_catalog_jobs WHERE catalog_id=? AND generation=? AND status='ready' AND EXISTS(SELECT 1 FROM catalog_sources c WHERE c.catalog_id=vod_catalog_jobs.catalog_id AND c.r2_key=vod_catalog_jobs.snapshot_key AND c.synced_at=vod_catalog_jobs.snapshot_time))").bind(job.catalog_id,job.generation,job.catalog_id,job.generation));
   const updateIndex=rows.length?1:0;
   const committed=await env.DB.batch(stmts);
   if(!committed[updateIndex].meta.changes){await startVodJobs(env,now);return {status:'superseded'};}
   Object.assign(job,{cursor,entry_count:count,group_name:parsed.group});
   if(done)return {status:'ready',count};
  }
  return {status:'building',cursor:job.cursor,count:job.entry_count};
 }catch(error){
  await env.DB.prepare("UPDATE vod_catalog_jobs SET status='failed',lease_until=0 WHERE catalog_id=? AND generation=? AND lease_until=?").bind(job.catalog_id,job.generation,lease).run();throw error;
 }finally{
  await env.DB.prepare('UPDATE vod_catalog_jobs SET lease_until=0 WHERE catalog_id=? AND generation=? AND lease_until=?').bind(job.catalog_id,job.generation,lease).run();
 }
}
export async function enrichVod(env,{limit=2,now=Date.now(),fetcher=fetch}={}){
 if(!env.TMDB_API_KEY?.trim())return {matched:0,pending:true};
 const lease=now+120000;
 const locked=await env.DB.prepare("INSERT INTO vod_catalog_state(id,value) VALUES('metadata_lease',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value WHERE CAST(vod_catalog_state.value AS INTEGER)<=?").bind(String(lease),now).run();
 if(!locked.meta.changes)return {matched:0,attempts:0,busy:true};
 let matched=0,attempts=0;
 try{
 for(const table of TABLES){
  if(attempts>=limit)break;
  const rows=await env.DB.prepare(`SELECT id,titulo,ano FROM ${table} WHERE status_metadados NOT IN ('encontrado','manual') AND tags='[]' AND generos='[]' AND consultar_apos<=?
   AND EXISTS(SELECT 1 FROM vod_catalog_items i WHERE i.tipo=? AND i.item_id=${table}.id)
   ORDER BY consultar_apos,id LIMIT ?`).bind(now,table,limit-attempts).all();
  for(const row of rows.results||[]){
   attempts++;const query=validateQuery({type:table==='filmes'?'movie':'tv',title:row.titulo,year:row.ano});
   if(!query){await env.DB.prepare(`UPDATE ${table} SET status_metadados='sem_correspondencia',consultar_apos=? WHERE id=?`).bind(now+30*86400000,row.id).run();continue;}
   const origin='https://lux.internal';
   const response=await lookupTmdb(new Request(origin+'/api/metadata/tmdb',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({type:query.type,title:query.title,year:query.year})}),env,fetcher,()=>now);
   if(!response.ok){await env.DB.prepare(`UPDATE ${table} SET consultar_apos=? WHERE id=?`).bind(now+(response.status===429?86400000:3600000),row.id).run();return {matched,attempts,paused:true};}
   const data=await response.json();
   if(data.status==='matched'){
    const updated=await env.DB.prepare(`UPDATE ${table} SET tmdb_id=?,capa=?,fundo=?,generos=?,status_metadados='encontrado',metadados_em=? WHERE id=? AND status_metadados<>'manual' AND tags='[]' AND generos='[]'`)
     .bind(data.tmdbId||null,data.poster||null,data.backdrop||null,JSON.stringify(data.genres||[]),now,row.id).run();if(updated.meta.changes)matched++;
   }else await env.DB.prepare(`UPDATE ${table} SET status_metadados='sem_correspondencia',consultar_apos=?,metadados_em=? WHERE id=? AND status_metadados<>'manual' AND tags='[]' AND generos='[]'`).bind(now+7*86400000,now,row.id).run();
  }
 }
 return {matched,attempts};
 }finally{await env.DB.prepare("UPDATE vod_catalog_state SET value='0' WHERE id='metadata_lease' AND value=?").bind(String(lease)).run();}
}
export async function runVodMaintenance(env,{discover=false,now=Date.now()}={}){
 if(discover)await startVodJobs(env,now);
 else if(!await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='vod_catalog_jobs'").first())return {index:{status:'not_initialized'},metadata:null};
 const index=await advanceVodJob(env,{now});
 // Mantém a classificação fora do caminho de importação e da navegação.
 const metadata=index.status==='idle'?await enrichVod(env,{now}):null;
 return {index,metadata};
}
