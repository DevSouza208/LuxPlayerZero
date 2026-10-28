import {requiredSession,bodyJson,HttpError,reply} from './account-security.js';
import {ensureVodSchema} from './vod-schema.js';
import {startVodJobs,advanceVodJob,enrichVod,writeVodRows} from './vod-catalog.js';
import {refreshDailyCatalogs} from './catalog-snapshot.js';
import {normalizeSearchText} from '../public/media-taxonomy.js';
import {vodFailure} from './vod-errors.js';
const TABLES=['filmes','series'];
function labels(value){if(!Array.isArray(value)||value.length>30||value.some(s=>typeof s!=='string'||s.length>80||/[\x00-\x1f]/.test(s)))throw new HttpError(400,'Tags inválidas.');return JSON.stringify([...new Set(value.map(s=>s.trim()).filter(Boolean))]);}
export async function vodAdminApi(request,env){
 let stage='session';
 try{
  const user=await requiredSession(request,env);
  if(user.role!=='admin')throw new HttpError(403,'Somente o administrador pode organizar o catálogo.');
  if(request.method==='GET'){
   stage='schema';await ensureVodSchema(env.DB);stage='summary';const url=new URL(request.url);
   if(url.searchParams.get('view')==='rows'){
    const table=url.searchParams.get('tipo');if(!TABLES.includes(table))throw new HttpError(400,'Tipo inválido.');
    const query=normalizeSearchText((url.searchParams.get('q')||'').slice(0,100));
    const page=Math.max(1,Math.min(10000,Math.trunc(Number(url.searchParams.get('page'))||1)));
    const where=query?'WHERE titulo_normalizado>=? AND titulo_normalizado<?':'',args=query?[query,query+'\uffff']:[];
    const total=await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} ${where}`).bind(...args).first();
    const rows=await env.DB.prepare(`SELECT * FROM ${table} ${where} ORDER BY titulo_normalizado,id LIMIT 40 OFFSET ?`).bind(...args,(page-1)*40).all();
    return reply({tipo:table,page,total:total.n,rows:rows.results});
   }
   const filmes=await env.DB.prepare('SELECT COUNT(*) AS total,SUM(CASE WHEN generos<>\'[]\' OR tags<>\'[]\' OR status_metadados=\'encontrado\' THEN 1 ELSE 0 END) AS classificados FROM filmes').first();
   const series=await env.DB.prepare('SELECT COUNT(*) AS total,SUM(CASE WHEN generos<>\'[]\' OR tags<>\'[]\' OR status_metadados=\'encontrado\' THEN 1 ELSE 0 END) AS classificados FROM series').first();
   const jobs=await env.DB.prepare('SELECT catalog_id,cursor,entry_count,status,updated_at FROM vod_catalog_jobs ORDER BY updated_at DESC LIMIT 50').all();
   const hasSources=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='catalog_sources'").first();
   const sources=hasSources?await env.DB.prepare("SELECT catalog_id,item_count,size_bytes FROM catalog_sources ORDER BY catalog_id").all():{results:[]};
   const progress={read:0,total:0};for(const source of sources.results){progress.total+=source.item_count;const job=jobs.results.find(job=>job.catalog_id===source.catalog_id);progress.read+=Math.min(source.item_count,job?.entry_count||0);}
   const metadata=await env.DB.prepare("SELECT value FROM vod_catalog_state WHERE id='metadata_status'").first();
   return reply({filmes,series,jobs:jobs.results,sources:sources.results,progress,tmdb:{configured:Boolean(env.TMDB_API_KEY?.trim()),last:metadata?JSON.parse(metadata.value):null}});
  }
  if(request.method!=='POST')throw new HttpError(405,'Método não permitido.');
  const body=await bodyJson(request,131072);
  if(!['start','step','edit','enrich','refresh','seed','rebuild'].includes(body.action))throw new HttpError(400,'Ação inválida.');
  stage='schema';await ensureVodSchema(env.DB);stage=body.action;
  if(body.action==='rebuild'){
   if(body.confirmation!=='RECONSTRUIR CATALOGO')throw new HttpError(400,'Confirme a exclusão das edições manuais do catálogo.');
   // A condição é repetida dentro da transação: uma leitura anterior não protege de outro Worker.
   const available="NOT EXISTS(SELECT 1 FROM vod_catalog_jobs WHERE lease_until>?) AND NOT EXISTS(SELECT 1 FROM vod_catalog_state WHERE id='metadata_lease' AND CAST(value AS INTEGER)>?)";
   const now=Date.now();
   const result=await env.DB.batch([
    env.DB.prepare(`INSERT INTO vod_catalog_state(id,value) SELECT 'rebuild_guard',? WHERE ${available} ON CONFLICT(id) DO UPDATE SET value=excluded.value`).bind(String(now),now,now),
    ...['filmes','series','vod_catalog_items','vod_catalog_jobs'].map(table=>env.DB.prepare(`DELETE FROM ${table} WHERE EXISTS(SELECT 1 FROM vod_catalog_state WHERE id='rebuild_guard' AND value=?)`).bind(String(now))),
    env.DB.prepare("DELETE FROM vod_catalog_state WHERE id IN ('metadata_status','metadata_lease') AND EXISTS(SELECT 1 FROM vod_catalog_state WHERE id='rebuild_guard' AND value=?)").bind(String(now)),
    env.DB.prepare("DELETE FROM vod_catalog_state WHERE id='rebuild_guard' AND value=?").bind(String(now))
   ]);
   if(!result[0].meta.changes)throw new HttpError(409,'Existe um lote em andamento. Aguarde a conclusão antes de reconstruir.');
   return reply({ok:true});
  }
  if(body.action==='seed'){
   if(!Array.isArray(body.rows)||!body.rows.length||body.rows.length>60)throw new HttpError(400,'Lote inválido.');
   const now=Date.now(),rows=body.rows.map(row=>{
    if(!TABLES.includes(row.tipo)||typeof row.titulo!=='string'||!row.titulo.trim()||row.titulo.length>240)throw new HttpError(400,'Título inválido.');
    const ano=row.ano==null?null:Number(row.ano);if(ano!==null&&(!Number.isInteger(ano)||ano<1800||ano>2200))throw new HttpError(400,'Ano inválido.');
    const nome=normalizeSearchText(row.titulo),provider=row.id_provedor==null?null:String(row.id_provedor),host=String(row.fornecedor||'');
    if(provider&&!/^[a-z0-9_.:-]{1,160}$/i.test(provider)||host&&!/^[a-z0-9.:[\]-]{1,255}$/i.test(host))throw new HttpError(400,'Fornecedor inválido.');
    const refs=Array.isArray(row.referencias)?row.referencias.slice(0,80).filter(ref=>typeof ref.id_provedor==='string'&&/^[a-z0-9_.:-]{1,160}$/i.test(ref.id_provedor)&&typeof ref.fornecedor==='string'&&/^[a-z0-9.:[\]-]{1,255}$/i.test(ref.fornecedor)):[];
    return {referencias:refs,tipo:row.tipo,id:nome+'|'+(ano||''),titulo:row.titulo.trim(),titulo_normalizado:nome,ano,nome_original:String(row.nome_original||row.titulo).slice(0,240),id_provedor:provider,fornecedor:host,tags_fonte:JSON.parse(labels(row.tags_fonte||[]))};
   });
   stage='seed_titles';for(const table of TABLES)await writeVodRows(env.DB,table,rows.filter(row=>row.tipo===table),now);
   stage='seed_links';await env.DB.prepare(`INSERT INTO vod_catalog_items(catalog_id,tipo,item_id,generation,ids_provedor)
    SELECT ?,json_extract(value,'$.tipo'),json_extract(value,'$.id'),'manual',json_extract(value,'$.referencias') FROM json_each(?) WHERE 1
    ON CONFLICT(catalog_id,tipo,item_id) DO UPDATE SET ids_provedor=(SELECT json_group_array(json(value)) FROM (SELECT value FROM json_each(vod_catalog_items.ids_provedor) UNION SELECT value FROM json_each(excluded.ids_provedor)))
    WHERE EXISTS(SELECT 1 FROM json_each(excluded.ids_provedor) incoming WHERE NOT EXISTS(SELECT 1 FROM json_each(vod_catalog_items.ids_provedor) saved WHERE json_extract(saved.value,'$.id_provedor')=json_extract(incoming.value,'$.id_provedor') AND json_extract(saved.value,'$.fornecedor')=json_extract(incoming.value,'$.fornecedor')))`).bind('manual:'+user.user_id,JSON.stringify(rows)).run();
   return reply({imported:rows.length});
  }
  if(body.action==='refresh'){
   if(typeof body.catalogId!=='string'||body.catalogId.length>100)throw new HttpError(400,'Fonte inválida.');
   const result=await refreshDailyCatalogs(env,fetch,{catalogId:body.catalogId});
   return reply({...result,skipped:!result.updated&&!result.failed},result.failed?502:200);
  }
  if(body.action==='start')return reply({sources:await startVodJobs(env),status:'started'});
  if(body.action==='step')return reply(await advanceVodJob(env,{chunks:4}));
  if(body.action==='enrich')return reply(await enrichVod(env));
  const table=body.tipo;if(!TABLES.includes(table)||typeof body.id!=='string'||body.id.length>300)throw new HttpError(400,'Título inválido.');
  const titulo=String(body.titulo||'').trim();if(!titulo||titulo.length>240)throw new HttpError(400,'Título inválido.');
  const ano=body.ano==null||body.ano===''?null:Number(body.ano);if(ano!==null&&(!Number.isInteger(ano)||ano<1800||ano>2200))throw new HttpError(400,'Ano inválido.');
  const tmdb=body.tmdb_id==null||body.tmdb_id===''?null:Number(body.tmdb_id);if(tmdb!==null&&(!Number.isSafeInteger(tmdb)||tmdb<1))throw new HttpError(400,'ID TMDB inválido.');
  const provider=String(body.id_provedor||'').trim();if(provider&&!/^[a-z0-9_.:-]{1,160}$/i.test(provider))throw new HttpError(400,'ID do fornecedor inválido.');
  const changed=await env.DB.prepare(`UPDATE ${table} SET titulo=?,titulo_normalizado=?,ano=?,tmdb_id=?,id_provedor=?,generos=?,tags=?,colecoes=?,status_metadados='manual',atualizado_em=? WHERE id=?`)
   .bind(titulo,normalizeSearchText(titulo),ano,tmdb,provider||null,labels(body.generos),labels(body.tags),labels(body.colecoes),Date.now(),body.id).run();
  if(!changed.meta.changes)throw new HttpError(404,'Título não encontrado.');
  return reply({ok:true});
 }catch(error){
  if(error instanceof HttpError)return reply({error:error.message},error.status);
  const failure=vodFailure(error,stage);const reference=crypto.randomUUID();
  console.error('vod_admin_failure',{reference,code:failure.code,stage});
  const {status,...payload}=failure;return reply({...payload,reference},status);
 }
}
