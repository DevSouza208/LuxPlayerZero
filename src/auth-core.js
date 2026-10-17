/** Auth server-only. Bootstrap admin via secret LUX_ADMIN_BOOTSTRAP_PASSWORD. */
const encoder=new TextEncoder(),TTL=7*24*3600*1000,ITER=160000;
const schema=["CREATE TABLE IF NOT EXISTS lux_users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_salt TEXT NOT NULL, password_hash TEXT NOT NULL, session_epoch INTEGER NOT NULL DEFAULT 0, role TEXT NOT NULL DEFAULT 'user', created_at TEXT NOT NULL)","CREATE TABLE IF NOT EXISTS lux_login_attempts (attempt_key TEXT PRIMARY KEY, failures INTEGER NOT NULL, expires_at INTEGER NOT NULL)"];
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer'}});
const ready=env=>typeof env?.DB?.prepare==='function'&&typeof env.LUX_SESSION_SECRET==='string'&&env.LUX_SESSION_SECRET.length>=32;
const init=async env=>{for(const sql of schema)await env.DB.prepare(sql).run()};
function b64(data){let raw='';for(const byte of data)raw+=String.fromCharCode(byte);return btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function unb64(raw){if(typeof raw!=='string'||raw.length>4096||!/^[a-z0-9_-]+$/i.test(raw))throw Error('Token');return Uint8Array.from(atob(raw.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-raw.length%4)%4)),c=>c.charCodeAt(0))}
function equal(a,b){const x=encoder.encode(String(a)),y=encoder.encode(String(b));let diff=x.length^y.length;for(let i=0;i<Math.max(x.length,y.length);i++)diff|=(x[i]||0)^(y[i]||0);return diff===0}
async function hashed(password,salt){const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);return b64(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:unb64(salt),iterations:ITER,hash:'SHA-256'},key,256)))}
async function cryptoKey(env){const raw=await crypto.subtle.digest('SHA-256',encoder.encode(env.LUX_SESSION_SECRET));return crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt'])}
async function ticket(user,env){const iv=crypto.getRandomValues(new Uint8Array(12));const data=encoder.encode(JSON.stringify({id:user.id,epoch:user.session_epoch,exp:Date.now()+TTL,typ:'lux-session'}));const cypher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await cryptoKey(env),data));const all=new Uint8Array(iv.length+cypher.length);all.set(iv);all.set(cypher,iv.length);return b64(all)}
function sessionCookie(request){const row=(request.headers.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('lux_session='));return row?.slice(12)||''}
export async function authenticatedUser(request,env){if(!ready(env))return null;try{const data=unb64(sessionCookie(request));if(data.length<29)return null;const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:data.slice(0,12)},await cryptoKey(env),data.slice(12));const token=JSON.parse(new TextDecoder().decode(plain));if(token.typ!=='lux-session'||token.exp<Date.now()||typeof token.id!=='string')return null;const user=await env.DB.prepare('SELECT id, username, role, session_epoch FROM lux_users WHERE id=?').bind(token.id).first();return user&&user.session_epoch===token.epoch?user:null}catch{return null}}
const sameOrigin=request=>request.headers.get('origin')===new URL(request.url).origin;
export async function login(request,env){
if(!ready(env))return json({error:'Configure DB e LUX_SESSION_SECRET no Cloudflare.'},503);
if(!sameOrigin(request))return json({error:'Origem não autorizada.'},403);
if(!String(request.headers.get('content-type')||'').includes('application/json'))return json({error:'Formato não aceito.'},415);
if(Number(request.headers.get('content-length')||0)>4096)return json({error:'Dados muito grandes.'},413);
let body;try{body=await request.json()}catch{return json({error:'Dados inválidos.'},400)}
const username=String(body?.identity||'').trim().toLowerCase(),password=String(body?.password||'');
if(!/^[a-z0-9_.@-]{3,80}$/.test(username)||!password||password.length>256)return json({error:'Usuário ou senha inválidos.'},401);
try{
await init(env);const now=Date.now(),ip=(request.headers.get('cf-connecting-ip')||'unknown').slice(0,80),attemptKey=ip+':'+username;
const attempt=await env.DB.prepare('SELECT failures, expires_at FROM lux_login_attempts WHERE attempt_key=?').bind(attemptKey).first();
if(attempt?.expires_at>now&&attempt.failures>=5)return json({error:'Muitas tentativas. Tente novamente em 15 minutos.'},429);
let user=await env.DB.prepare('SELECT * FROM lux_users WHERE username=?').bind(username).first();
if(!user&&username==='admin'&&env.LUX_ADMIN_BOOTSTRAP_PASSWORD&&equal(password,env.LUX_ADMIN_BOOTSTRAP_PASSWORD)){
const salt=b64(crypto.getRandomValues(new Uint8Array(24))),hash=await hashed(password,salt);
await env.DB.prepare('INSERT OR IGNORE INTO lux_users (id,username,password_salt,password_hash,role,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),'admin',salt,hash,'admin',new Date().toISOString()).run();
user=await env.DB.prepare('SELECT * FROM lux_users WHERE username=?').bind(username).first();
}
if(!user||!equal(await hashed(password,user.password_salt),user.password_hash)){
await env.DB.prepare('INSERT INTO lux_login_attempts(attempt_key,failures,expires_at) VALUES (?,1,?) ON CONFLICT(attempt_key) DO UPDATE SET failures=CASE WHEN expires_at<? THEN 1 ELSE failures+1 END, expires_at=CASE WHEN expires_at<? THEN ? ELSE expires_at END').bind(attemptKey,now+900000,now,now,now+900000).run();
return json({error:'Usuário ou senha inválidos.'},401);
}
await env.DB.prepare('DELETE FROM lux_login_attempts WHERE attempt_key=?').bind(attemptKey).run();
const response=json({authenticated:true,username:user.username,role:user.role});response.headers.set('set-cookie','lux_session='+await ticket(user,env)+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+TTL/1000);return response;
}catch{return json({error:'Serviço de autenticação indisponível.'},503)}
}
export async function sessionStatus(request,env){const user=await authenticatedUser(request,env);return json(user?{authenticated:true,username:user.username,role:user.role}:{authenticated:false})}
export async function logout(request,env){if(!sameOrigin(request))return json({error:'Origem não autorizada.'},403);const user=await authenticatedUser(request,env);if(user){try{await env.DB.prepare('UPDATE lux_users SET session_epoch=session_epoch+1 WHERE id=?').bind(user.id).run()}catch{return json({error:'Falha ao sair.'},503)}}const response=json({authenticated:false});response.headers.set('set-cookie','lux_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');return response}
