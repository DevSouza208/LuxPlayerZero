import {tvHighlightsApi} from './tv-highlights.js';
import {requiredSession,bodyJson,HttpError,reply,digest,audit} from './account-security.js';
const text=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
export async function editorialApi(request,env) {
 try{
  const user=await requiredSession(request,env),url=new URL(request.url),path=url.pathname;
  if(path==='/api/editorial/tv-highlights')return tvHighlightsApi(request,env,user);
  if(request.method==='GET'){
   const start=Number(url.searchParams.get('from')||Date.now()),end=Number(url.searchParams.get('to')||start+86400000);
   if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end<=start||end-start>7*86400000)throw new HttpError(400,'Intervalo inválido (máximo sete dias).');
   if(path==='/api/editorial/guide'){
    const channel=text(url.searchParams.get('channel'),160),q=text(url.searchParams.get('q'),100);
    const rows=await env.DB.prepare(`SELECT id,channel,title,starts_at AS start,ends_at AS end,description FROM guide_programs
      WHERE starts_at<? AND ends_at>? AND (?='' OR channel=?) AND (?='' OR instr(lower(title),lower(?))>0)
      ORDER BY starts_at,id LIMIT 501`).bind(end,start,channel,channel,q,q).all();
    return reply({programs:rows.results.slice(0,500),truncated:rows.results.length>500});
   }
   if(path==='/api/editorial/sports'){
    const rows=await env.DB.prepare('SELECT id,title,competition,sport,starts_at,source_url,channels FROM sports_events WHERE starts_at>=? AND starts_at<? ORDER BY starts_at LIMIT 200').bind(start,end).all();
    return reply({events:rows.results.map(row=>({...row,channels:JSON.parse(row.channels)}))});
   }
   if(path==='/api/editorial/reminders'){
    if(!user.profile_id)throw new HttpError(409,'Escolha um perfil.');
    const rows=await env.DB.prepare(`SELECT g.id,g.channel,g.title,g.starts_at AS start FROM profile_reminders r JOIN guide_programs g ON g.id=r.program_id WHERE r.profile_id=? AND g.starts_at>=? AND g.starts_at<? ORDER BY g.starts_at LIMIT 100`)
      .bind(user.profile_id,start,end).all();return reply({reminders:rows.results});
   }
  }
  if(request.method!=='POST')throw new HttpError(405,'Método não permitido.');
  const body=await bodyJson(request,256000);
  if(path==='/api/editorial/reminders'){
   if(!user.profile_id)throw new HttpError(409,'Escolha um perfil.');
   if(body.remove)await env.DB.prepare('DELETE FROM profile_reminders WHERE profile_id=? AND program_id=?').bind(user.profile_id,text(body.id,80)).run();
   else await env.DB.prepare(`INSERT OR IGNORE INTO profile_reminders(profile_id,program_id) SELECT ?,id FROM guide_programs WHERE id=?`).bind(user.profile_id,text(body.id,80)).run();
   return reply({ok:true});
  }
  if(user.role!=='admin')throw new HttpError(403,'Ação exclusiva do administrador.');
  if(path==='/api/editorial/guide'){
   if(!Array.isArray(body.programs)||body.programs.length<1||body.programs.length>80)throw new HttpError(400,'Envie de 1 a 80 programas por lote.');
   const now=Date.now(),statements=[];
   for(const p of body.programs){
    const channel=text(p.channel,160),title=text(p.title,240);
    if(!channel||!title||!Number.isSafeInteger(p.start)||!Number.isSafeInteger(p.end)||p.end<=p.start||p.end-p.start>7*86400000)throw new HttpError(400,'Programa inválido.');
    const id=await digest(channel+'|'+p.start);
    statements.push(env.DB.prepare(`INSERT INTO guide_programs(id,channel,title,starts_at,ends_at,description,updated_at) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title,ends_at=excluded.ends_at,description=excluded.description,updated_at=excluded.updated_at`)
      .bind(id,channel,title,p.start,p.end,text(p.description,2000),now));
   }
   statements.push(audit(env,user.user_id,'guide.import',String(body.programs.length)));
   await env.DB.batch(statements);return reply({imported:body.programs.length});
  }
  if(path==='/api/editorial/sports'){
   let source;try{source=new URL(body.sourceUrl)}catch{throw new HttpError(400,'Informe a fonte pública do evento.')}
   if(source.protocol!=='https:'||source.username||source.password||source.search||source.hash||source.href.length>1000)throw new HttpError(400,'Use fonte HTTPS pública sem credenciais ou parâmetros.');
   const title=text(body.title,200),competition=text(body.competition,120),sport=text(body.sport,60);
   if(!title||!sport||!competition||!Number.isSafeInteger(body.start))throw new HttpError(400,'Confira o evento.');
   const channels=Array.isArray(body.channels)?body.channels.map(c=>text(c,160)).filter(Boolean).slice(0,20):[];
   if(channels.length&&body.transmissionConfirmed!==true)throw new HttpError(400,'Informe canais somente com transmissão confirmada.');
   const id=await digest(title+'|'+body.start);
   await env.DB.batch([env.DB.prepare(`INSERT INTO sports_events(id,title,competition,sport,starts_at,source_url,channels,updated_at) VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET competition=excluded.competition,sport=excluded.sport,source_url=excluded.source_url,channels=excluded.channels,updated_at=excluded.updated_at`)
    .bind(id,title,competition,sport,body.start,source.href,JSON.stringify(channels),Date.now()),audit(env,user.user_id,'sports.save',id)]);
   return reply({ok:true});
  }
  throw new HttpError(404,'Recurso não encontrado.');
 }catch(error){return reply({error:error instanceof HttpError?error.message:'Programação indisponível. Verifique as migrações.'},error instanceof HttpError?error.status:503)}
}
