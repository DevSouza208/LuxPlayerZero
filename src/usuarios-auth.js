import {checkRequestBudget} from './request-budget.js';
import {HttpError,reply,bodyJson,cookie,randomToken,digest,equal} from './account-security.js';
const encoder=new TextEncoder(),ready=new WeakMap(),DAYS=7*86400000;
import {permittedUrl} from './bridge-core.js';
import {refreshCatalogSource} from './catalog-snapshot.js';
const SQL=[
 `CREATE TABLE IF NOT EXISTS usuarios_sessoes(token_hash TEXT PRIMARY KEY,id TEXT NOT NULL UNIQUE,usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,senha_marca TEXT NOT NULL,device TEXT NOT NULL,expires_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS usuarios_limites(chave TEXT PRIMARY KEY,tentativas INTEGER NOT NULL,expira_em INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS usuarios_estado(usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,valor TEXT NOT NULL DEFAULT '{}',versao INTEGER NOT NULL DEFAULT 0)`,
 `CREATE TABLE IF NOT EXISTS usuarios_convites(token_hash TEXT PRIMARY KEY,source_url TEXT NOT NULL,created_by INTEGER NOT NULL,expires_at INTEGER NOT NULL,claimed_by INTEGER UNIQUE)`,
 `CREATE TABLE IF NOT EXISTS usuarios_atualizacoes(usuario_id INTEGER PRIMARY KEY,day TEXT NOT NULL,catalog_id TEXT,updated_at TEXT)`
];
export async function hasUsuarios(env){
 if(!env?.DB?.prepare)return false;
 return Boolean(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='usuarios'").bind().first());
}
async function setup(env){
 if(!ready.has(env.DB))ready.set(env.DB,env.DB.batch(SQL.map(sql=>env.DB.prepare(sql))).catch(error=>{ready.delete(env.DB);throw error}));
 await ready.get(env.DB);
}
const role=row=>/^(admin|administrador|administrator)$/i.test(String(row.nivel_acesso).trim())?'admin':'user';
const blocked=row=>/^(bloqueado|inativo|desativado)$/i.test(String(row.nivel_acesso).trim());
function secret(env){const value=env.LUX_AUTH_PEPPER||env.BRIDGE_ACCESS_KEY;if(typeof value!=='string'||value.length<32)throw new HttpError(503,'Configure o segredo de autenticação no servidor.');return value;}
async function passwordBits(password,salt,env){
 const pepper=await crypto.subtle.importKey('raw',encoder.encode(secret(env)),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const material=await crypto.subtle.sign('HMAC',pepper,encoder.encode(password));
 const key=await crypto.subtle.importKey('raw',material,'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encoder.encode(salt),iterations:100000},key,256);
 return [...new Uint8Array(bits)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function hashUsuarioPassword(password,env){const salt=randomToken();return 'lux$1$'+salt+'$'+await passwordBits(password,salt,env);}
async function passwordMatches(password,stored,env){
 if(stored.startsWith('lux$')){const parts=stored.split('$');if(parts.length!==4||parts[1]!=='1'||!/^[a-f0-9]{64}$/.test(parts[2])||!/^[a-f0-9]{64}$/.test(parts[3]))return false;return equal(await passwordBits(password,parts[2],env),parts[3]);}
 // Compatibilidade com cadastro manual no D1: convertido antes de abrir a sessão.
 await passwordBits(password,'missing-user-timing-salt',env);
 return equal(password,stored);
}
async function rate(env,key,max){
 const now=Date.now();const row=await env.DB.prepare(`INSERT INTO usuarios_limites(chave,tentativas,expira_em) VALUES (?,1,?) ON CONFLICT(chave) DO UPDATE SET tentativas=CASE WHEN expira_em<=? THEN 1 ELSE tentativas+1 END,expira_em=CASE WHEN expira_em<=? THEN ? ELSE expira_em END RETURNING tentativas`).bind(key,now+900000,now,now,now+900000).first();
 if(row.tentativas>max)throw new HttpError(429,'Muitas tentativas. Aguarde 15 minutos.');
}
export async function usuarioSession(request,env){
 const token=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('__Host-lux_account='))?.slice(19);
 if(!token||!/^[a-f0-9]{64}$/.test(token)||!await hasUsuarios(env))return null;
 await setup(env);
 const row=await env.DB.prepare(`SELECT u.*,s.id AS session_id,s.token_hash,s.senha_marca FROM usuarios_sessoes s JOIN usuarios u ON u.id=s.usuario_id WHERE s.token_hash=? AND s.expires_at>?`).bind(await digest(token),Date.now()).first();
 if(!row||blocked(row)||!equal(await digest(String(row.senha)),row.senha_marca))return null;
 return {backend:'usuarios',usuario_id:row.id,user_id:'usuario:'+row.id,username:row.usuario,role:role(row),profile_id:'usuario:'+row.id,session_id:row.session_id,token_hash:row.token_hash};
}
function safeSource(value,protocol){
 if(value==null||value==='')return null;
 if(typeof value!=='string'||value.length>8192)throw new HttpError(400,'Endereço da lista inválido.');
 let url;try{url=new URL(value.trim())}catch{throw new HttpError(400,'Endereço da lista inválido.')}
 if(url.protocol!==protocol||url.username||url.password||url.hash)throw new HttpError(400,'Confira o protocolo da lista.');
 // A URL será validada novamente pela allowlist antes de qualquer download servidor.
 return url.href;
}
export async function usuariosApi(request,env,validateState){
 if(!await hasUsuarios(env))return null;
 const path=new URL(request.url).pathname.replace(/\/$/,'');
 try{
  secret(env);await setup(env);
  if(path==='/api/account/login'&&request.method==='POST'){
   const body=await bodyJson(request,4096),identity=typeof body.identity==='string'?body.identity.trim():'',password=body.password;
   await rate(env,await digest('ip:'+(request.headers.get('cf-connecting-ip')||'unknown')),30);
   if(!identity||identity.length>120||typeof password!=='string'||!password||password.length>256)throw new HttpError(400,'Informe usuário e senha.');
   await rate(env,await digest('user:'+identity.toLowerCase()),8);
   const row=await env.DB.prepare('SELECT * FROM usuarios WHERE usuario=? COLLATE NOCASE').bind(identity).first();
   const stored=String(row?.senha??'');const valid=await passwordMatches(password,stored||'invalid',env);
   if(!row||blocked(row)||!valid)throw new HttpError(401,'Usuário ou senha inválidos.');
   let encoded=stored;
   if(!stored.startsWith('lux$')){
    encoded=await hashUsuarioPassword(password,env);
    await env.DB.prepare('UPDATE usuarios SET senha=? WHERE id=? AND senha=?').bind(encoded,row.id,row.senha).run();
   }
   // Evita abrir sessão se a senha foi alterada durante a verificação.
   const current=await env.DB.prepare('SELECT senha,nivel_acesso FROM usuarios WHERE id=?').bind(row.id).first();
   if(!current||blocked(current)||!equal(String(current.senha),encoded))throw new HttpError(401,'Usuário ou senha inválidos.');
   const token=randomToken();await env.DB.prepare('INSERT INTO usuarios_sessoes(token_hash,id,usuario_id,senha_marca,device,expires_at) VALUES (?,?,?,?,?,?)').bind(await digest(token),crypto.randomUUID(),row.id,await digest(encoded),(request.headers.get('user-agent')||'Dispositivo').slice(0,180),Date.now()+DAYS).run();
   await env.DB.prepare('DELETE FROM usuarios_limites WHERE chave=?').bind(await digest('user:'+identity.toLowerCase())).run();
   return cookie(reply({authenticated:true,backend:'usuarios',username:row.usuario,role:role(current),profileId:'usuario:'+row.id}),token);
  }
  if(path==='/api/account/register'&&request.method==='POST'){
    const body=await bodyJson(request,8192);
    const username=typeof body.identity==='string'?body.identity.trim():'';
    const name=typeof body.name==='string'?body.name.trim():'';
    if(!/^[a-zA-Z0-9_.-]{3,40}$/.test(username)||!name||name.length>80||typeof body.password!=='string'||body.password.length<12||body.password.length>256||!/^[a-f0-9]{64}$/.test(body.invite||''))throw new HttpError(400,'Confira nome, usuário, senha de pelo menos 12 caracteres e convite.');
    const inviteHash=await digest(body.invite);
    const row=await env.DB.prepare('SELECT source_url FROM usuarios_convites WHERE token_hash=? AND claimed_by IS NULL AND expires_at>?').bind(inviteHash,Date.now()).first();
    if(!row)throw new HttpError(400,'Convite inválido ou utilizado.');
    const encoded=await hashUsuarioPassword(body.password,env);
    const result=await env.DB.prepare(`INSERT INTO usuarios(usuario,senha,nome,lista_http,lista_https,nivel_acesso)
      SELECT ?,?,?,?,?,'usuario' WHERE EXISTS(SELECT 1 FROM usuarios_convites WHERE token_hash=? AND claimed_by IS NULL AND expires_at>?)`)
      .bind(username,encoded,name,row.source_url.startsWith('http:')?row.source_url:null,row.source_url.startsWith('https:')?row.source_url:null,inviteHash,Date.now()).run();
    if(!result.meta.changes)throw new HttpError(409,'Convite indisponível.');
    const claimed=await env.DB.prepare('UPDATE usuarios_convites SET claimed_by=(SELECT id FROM usuarios WHERE usuario=? COLLATE NOCASE) WHERE token_hash=? AND claimed_by IS NULL').bind(username,inviteHash).run();
    if(!claimed.meta.changes)throw new HttpError(409,'Convite já utilizado. Contate o administrador.');
    return reply({ok:true,registered:true});
  }
  const user=await usuarioSession(request,env);
  if(path==='/api/account/session'&&request.method==='GET')return reply(user?{authenticated:true,backend:'usuarios',username:user.username,role:user.role,profileId:user.profile_id}:{authenticated:false});
  if(!user)throw new HttpError(401,'Entre na sua conta para continuar.');
  if(path!=='/api/account/logout'){
   const blocked=await checkRequestBudget(env,user.user_id,path==='/api/account/state'&&request.method==='POST'?'sync':'account');
   if(blocked)return blocked;
  }
  if(path==='/api/account/invite'&&request.method==='POST'){
    if(user.role!=='admin')throw new HttpError(403,'Somente administrador.');
    const body=await bodyJson(request,8192);
    let source;try{source=permittedUrl(body.url,env).href}catch{throw new HttpError(400,'URL de lista não permitida.')}
    const token=randomToken();
    await env.DB.prepare('INSERT INTO usuarios_convites(token_hash,source_url,created_by,expires_at) VALUES (?,?,?,?)')
      .bind(await digest(token),source,user.usuario_id,Date.now()+86400000).run();
    return reply({token,expiresIn:86400,inviteUrl:new URL('/?invite='+token,request.url).href});
  }
  if(path==='/api/account/daily-refresh'&&request.method==='POST'){
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const previous=await env.DB.prepare('SELECT day,catalog_id FROM usuarios_atualizacoes WHERE usuario_id=?').bind(user.usuario_id).first();
    if(previous?.day===today)return reply({ok:true,alreadyUpdated:true,catalogId:previous.catalog_id});
    const row=await env.DB.prepare('SELECT lista_https,lista_http FROM usuarios WHERE id=?').bind(user.usuario_id).first();
    const source=row?.lista_https||row?.lista_http;
    if(!source)throw new HttpError(404,'Nenhuma lista vinculada à conta.');
    const response=await refreshCatalogSource(source,env,fetch,{requireFresh:true});
    const result=await response.json();
    if(!response.ok)return reply({error:result.error||'Falha ao atualizar lista.'},response.status);
    await env.DB.prepare('INSERT INTO usuarios_atualizacoes(usuario_id,day,catalog_id,updated_at) VALUES (?,?,?,?) ON CONFLICT(usuario_id) DO UPDATE SET day=excluded.day,catalog_id=excluded.catalog_id,updated_at=excluded.updated_at')
      .bind(user.usuario_id,today,result.catalogId,new Date().toISOString()).run();
    return reply({ok:true,catalogId:result.catalogId,url:result.url,updatedAt:result.syncedAt});
  }
  if(path==='/api/account/daily-refresh'&&request.method==='GET'){
    const row=await env.DB.prepare('SELECT day,catalog_id,updated_at FROM usuarios_atualizacoes WHERE usuario_id=?').bind(user.usuario_id).first();
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    return reply({needsRefresh:row?.day!==today,catalogId:row?.catalog_id||null,updatedAt:row?.updated_at||null});
  }
  if(path==='/api/account/source'){
   if(request.method==='GET'){
    const row=await env.DB.prepare('SELECT lista_http,lista_https FROM usuarios WHERE id=?').bind(user.usuario_id).first();return reply(row);
   }
   if(request.method==='POST'){
    const body=await bodyJson(request,20000);
    const http=safeSource(body.lista_http,'http:'),https=safeSource(body.lista_https,'https:');
    await env.DB.prepare('UPDATE usuarios SET lista_http=?,lista_https=? WHERE id=?').bind(http,https,user.usuario_id).run();return reply({ok:true});
   }
  }
  if(path==='/api/account/logout'&&request.method==='POST'){
   await bodyJson(request);await env.DB.prepare('DELETE FROM usuarios_sessoes WHERE token_hash=?').bind(user.token_hash).run();return cookie(reply({ok:true}));
  }
  if(path==='/api/account/profiles'&&request.method==='GET'){
   const row=await env.DB.prepare('SELECT nome FROM usuarios WHERE id=?').bind(user.usuario_id).first();return reply({profiles:[{id:user.profile_id,name:row.nome,avatar:'luxite',protected:0,is_default:1}]});
  }
  if(path==='/api/account/profile/select'&&request.method==='POST'){const body=await bodyJson(request);if(body.id!==user.profile_id)throw new HttpError(403,'Perfil inválido.');return reply({ok:true,profileId:user.profile_id});}
  if(path==='/api/account/state'){
   if(request.method==='GET'){const row=await env.DB.prepare('SELECT valor,versao FROM usuarios_estado WHERE usuario_id=?').bind(user.usuario_id).first();return reply({profileId:user.profile_id,value:row?JSON.parse(row.valor):{},version:row?.versao||0});}
   if(request.method==='POST'){
    const body=await bodyJson(request,262144);if(body.profileId!==user.profile_id||!Number.isSafeInteger(body.version))throw new HttpError(400,'Estado inválido.');const value=validateState(body.value);
    await env.DB.prepare('INSERT OR IGNORE INTO usuarios_estado(usuario_id) VALUES (?)').bind(user.usuario_id).run();
    const changed=await env.DB.prepare('UPDATE usuarios_estado SET valor=?,versao=versao+1 WHERE usuario_id=? AND versao=?').bind(JSON.stringify(value),user.usuario_id,body.version).run();if(!changed.meta.changes)throw new HttpError(409,'Recarregue para sincronizar suas alterações.');return reply({ok:true,version:body.version+1});
   }
  }
  if(path==='/api/account/revoke'&&request.method==='POST'){
   const body=await bodyJson(request);const query=body.all?env.DB.prepare('DELETE FROM usuarios_sessoes WHERE usuario_id=?').bind(user.usuario_id):env.DB.prepare('DELETE FROM usuarios_sessoes WHERE usuario_id=? AND id=?').bind(user.usuario_id,String(body.id||''));await query.run();return reply({ok:true});
  }
  if(path==='/api/account/password'&&request.method==='POST'){
   const body=await bodyJson(request);await rate(env,await digest('password:'+user.usuario_id),5);
   if(typeof body.current!=='string'||body.current.length>256||typeof body.password!=='string'||body.password.length<12||body.password.length>256)throw new HttpError(400,'Use uma nova senha de 12 a 256 caracteres.');
   const row=await env.DB.prepare('SELECT senha FROM usuarios WHERE id=?').bind(user.usuario_id).first();
   if(!row||!await passwordMatches(body.current,String(row.senha),env))throw new HttpError(403,'Senha atual incorreta.');
   const encoded=await hashUsuarioPassword(body.password,env);
   await env.DB.batch([env.DB.prepare('UPDATE usuarios SET senha=? WHERE id=? AND senha=?').bind(encoded,user.usuario_id,row.senha),env.DB.prepare('DELETE FROM usuarios_sessoes WHERE usuario_id=?').bind(user.usuario_id)]);return cookie(reply({ok:true}));
  }
  if(path==='/api/account/devices'&&request.method==='GET'){const rows=await env.DB.prepare('SELECT id,device,expires_at FROM usuarios_sessoes WHERE usuario_id=? AND expires_at>?').bind(user.usuario_id,Date.now()).all();return reply({devices:rows.results,current:user.session_id});}
  throw new HttpError(404,'Esta função não está disponível neste cadastro.');
 }catch(error){return reply({error:error instanceof HttpError?error.message:'Não foi possível acessar sua conta.'},error instanceof HttpError?error.status:503);}
}
