import {parseM3u} from '../public/playlist.js';
import {presentationForEntry} from '../public/cinema-title.js';
import {classifyItem} from '../public/home-model.js';
import {normalizeSearchText} from '../public/media-taxonomy.js';
import {requiredSession,bodyJson,HttpError,reply} from './account-security.js';
import {session as bridgeSession} from './bridge-core.js';
const CHUNK=512*1024,MAX_ROWS=40;
/** A bounded chunk ends at the last consumed URL; incomplete EXTINF is read again. */
export function indexChunk(bytes,{group='',final=false}={}) {
 const decoder=new TextDecoder(),rows=[];let begin=0,consumed=0,header='',override=false,nextGroup=group,committedGroup=group;
 for(let i=0;i<=bytes.length;i++){
  if(i===bytes.length&&!final)break;
  if(i<bytes.length&&bytes[i]!==10)continue;
  const line=decoder.decode(bytes.subarray(begin,i)).trim();const end=i<bytes.length?i+1:i;begin=end;
  if(line.startsWith('#EXTINF:')){header=line;override=false;}
  else if(line.startsWith('#EXTGRP:')){nextGroup=line.slice(8).trim();if(header)override=true;}
  else if(line&&!line.startsWith('#')){
   const parsed=parseM3u('#EXTM3U\n#EXTGRP:'+nextGroup+'\n'+(header?header+'\n':'')+(override?'#EXTGRP:'+nextGroup+'\n':'')+line)[0];
   if(parsed){const meta=presentationForEntry(parsed);rows.push({title:parsed.name.slice(0,240),display_title:(meta.displayName||parsed.name).slice(0,240),
     group_name:parsed.group.slice(0,240),kind:classifyItem(parsed),year:meta.catalogYear||null,
     search_text:normalizeSearchText([parsed.name,meta.displayName,parsed.group,...(meta.catalogTags||[])].join(' ')).slice(0,1000)})}
   header='';consumed=end;committedGroup=nextGroup;
   if(rows.length>=MAX_ROWS)break;
  }else if(!header){consumed=end;committedGroup=nextGroup}
 }
 if(final&&begin>=bytes.length&&rows.length<MAX_ROWS){consumed=bytes.length;committedGroup=nextGroup}
 return {rows,consumed,group:committedGroup};
}
export async function catalogSearchApi(request,env) {
 try{
  const user=await requiredSession(request,env);
  // Metadata access requires the existing bridge session as well; it is not bypassed.
  if(!await bridgeSession(request,env))throw new HttpError(401,'Conecte a fonte privada antes de consultar o índice.');
  const url=new URL(request.url);
  if(request.method==='GET'){
   const catalogId=url.searchParams.get('catalogId')||'',kind=url.searchParams.get('kind')||'movies';
   const page=Math.max(1,Math.min(100000,Math.trunc(Number(url.searchParams.get('page'))||1))),query=normalizeSearchText((url.searchParams.get('q')||'').slice(0,100));
   const head=await env.DB.prepare(`SELECT g.* FROM search_heads h JOIN search_generations g ON g.id=h.generation_id
    JOIN catalog_sources c ON c.catalog_id=h.catalog_id WHERE h.catalog_id=? AND g.snapshot_time=c.synced_at AND g.snapshot_key=c.r2_key`).bind(catalogId).first();
   if(!head)return reply({ready:false,entries:[],total:0});
   const year=Number(url.searchParams.get('year'))||0;
   const where="generation_id=? AND kind=? AND (?='' OR instr(search_text,?)>0) AND (?=0 OR year=?)";
   const args=[head.id,kind,query,query,year,year];
   const total=await env.DB.prepare('SELECT COUNT(*) AS n FROM search_entries WHERE '+where).bind(...args).first();
   const rows=await env.DB.prepare('SELECT ordinal,title,display_title,group_name,kind,year FROM search_entries WHERE '+where+' ORDER BY display_title,ordinal LIMIT 48 OFFSET ?').bind(...args,(page-1)*48).all();
   return reply({ready:true,generation:head.id,snapshotTime:head.snapshot_time,total:total.n,page,entries:rows.results});
  }
  if(request.method!=='POST')throw new HttpError(405,'Método não permitido.');
  if(user.role!=='admin')throw new HttpError(403,'Somente o administrador pode construir o índice.');
  const body=await bodyJson(request,4096);
  if(!body.generation){
   const source=await env.DB.prepare('SELECT catalog_id,r2_key,synced_at FROM catalog_sources WHERE catalog_id=?').bind(String(body.catalogId||'')).first();
   if(!source)throw new HttpError(404,'Snapshot não encontrado.');const id=crypto.randomUUID();
   await env.DB.prepare('INSERT INTO search_generations(id,catalog_id,snapshot_key,snapshot_time,created_at) VALUES (?,?,?,?,?)').bind(id,source.catalog_id,source.r2_key,source.synced_at,Date.now()).run();
   return reply({generation:id,status:'building',cursor:0,count:0});
  }
  const job=await env.DB.prepare('SELECT * FROM search_generations WHERE id=?').bind(String(body.generation)).first();
  if(!job)throw new HttpError(404,'Indexação não encontrada.');
  if(job.status!=='building')return reply({generation:job.id,status:job.status,count:job.row_count});
  const source=await env.DB.prepare('SELECT * FROM catalog_sources WHERE catalog_id=?').bind(job.catalog_id).first();
  if(!source||source.r2_key!==job.snapshot_key||source.synced_at!==job.snapshot_time)throw new HttpError(409,'O snapshot mudou. Inicie uma nova indexação.');
  const object=await env.CATALOG_BUCKET?.get(job.snapshot_key,{range:{offset:job.cursor,length:CHUNK}});
  if(!object)throw new HttpError(503,'Snapshot indisponível. O índice anterior permanece ativo.');
  const bytes=new Uint8Array(await object.arrayBuffer()),final=job.cursor+bytes.length>=source.size_bytes;
  const parsed=indexChunk(bytes,{group:job.group_name,final});
  if(!parsed.consumed)throw new HttpError(422,'Não foi possível avançar neste trecho da playlist.');
  const cursor=job.cursor+parsed.consumed,count=job.row_count+parsed.rows.length,done=cursor>=source.size_bytes;
  if(done&&count!==source.item_count)throw new HttpError(422,'Contagem diferente do snapshot. O índice anterior permanece ativo.');
  // D1 batch is atomic; a cursor lease prevents two workers from advancing the same job.
  // INSERTs use the same lease; a duplicate request becomes a no-op and returns conflict.
  const statements=parsed.rows.map((row,index)=>env.DB.prepare(`INSERT OR IGNORE INTO search_entries(generation_id,ordinal,title,display_title,group_name,kind,year,search_text)
    SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM search_generations WHERE id=? AND cursor=?)`)
    .bind(job.id,job.row_count+index,row.title,row.display_title,row.group_name,row.kind,row.year,row.search_text,job.id,job.cursor));
  statements.push(env.DB.prepare('UPDATE search_generations SET cursor=?,row_count=?,group_name=?,status=? WHERE id=? AND cursor=?')
    .bind(cursor,count,parsed.group,done?'ready':'building',job.id,job.cursor));
  if(done)statements.push(env.DB.prepare(`INSERT INTO search_heads(catalog_id,generation_id) VALUES (?,?)
    ON CONFLICT(catalog_id) DO UPDATE SET generation_id=excluded.generation_id`).bind(job.catalog_id,job.id));
  const batch=await env.DB.batch(statements);
  if(!batch[parsed.rows.length].meta.changes)throw new HttpError(409,'Outra requisição avançou a indexação. Consulte novamente.');
  return reply({generation:job.id,status:done?'ready':'building',cursor,count});
 }catch(error){return reply({error:error instanceof HttpError?error.message:'Índice indisponível. Verifique bindings e migrações.'},error instanceof HttpError?error.status:503)}
}
