/** Account security is independent of bridge authentication and media URLs. */
const encoder = new TextEncoder();
export const SESSION_SECONDS = 7 * 24 * 3600;
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const reply = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json;charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' }
});
export function requireConfig(env) {
  if (!env.DB?.prepare || typeof env.LUX_AUTH_PEPPER !== 'string' || env.LUX_AUTH_PEPPER.length < 32)
    throw new HttpError(503, 'Acesso indisponível. Configure o banco e o segredo de autenticação.');
}
export function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2,'0')).join('');
}
export async function digest(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))),
    n => n.toString(16).padStart(2,'0')).join('');
}
export function equal(a,b) {
  const x=encoder.encode(String(a)),y=encoder.encode(String(b));let diff=x.length^y.length;
  for(let i=0;i<Math.max(x.length,y.length);i++)diff|=(x[i]||0)^(y[i]||0);
  return diff===0;
}
export function validPassword(value) { return typeof value==='string' && value.length>=12 && value.length<=256; }
export async function hashPassword(password, salt, env) {
  // Workers caps each native PBKDF2 invocation at 100k. A secret HMAC pepper,
  // separate from D1, protects offline attacks after a database-only compromise.
  // Versioned hash permits a future migration to a memory-hard KDF.
  const pepper = await crypto.subtle.importKey('raw', encoder.encode(env.LUX_AUTH_PEPPER),
    { name:'HMAC', hash:'SHA-256' },false,['sign']);
  const material = await crypto.subtle.sign('HMAC',pepper,encoder.encode(password));
  const key = await crypto.subtle.importKey('raw',material,'PBKDF2',false,['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(salt),iterations:100000,hash:'SHA-256'},key,256);
  return 'v1:' + Array.from(new Uint8Array(bits),n=>n.toString(16).padStart(2,'0')).join('');
}
export async function bodyJson(request, max = 32768) {
  if(request.headers.get('origin')!==new URL(request.url).origin)throw new HttpError(403,'Origem não autorizada.');
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw new HttpError(415,'Envie JSON.');
  const reader=request.body?.getReader();if(!reader)throw new HttpError(400,'Dados ausentes.');
  let size=0;const chunks=[];
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;
    if(size>max){await reader.cancel();throw new HttpError(413,'Dados muito grandes.')}chunks.push(value)}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  try{const data=JSON.parse(new TextDecoder().decode(bytes));if(!data||Array.isArray(data)||typeof data!=='object')throw Error();return data}
  catch{throw new HttpError(400,'JSON inválido.')}
}
export function cookie(response, token='') {
  response.headers.set('set-cookie', '__Host-lux_account='+token+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+(token?SESSION_SECONDS:0));
  return response;
}
export async function session(request,env) {
  requireConfig(env);
  const token=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-lux_account='))?.slice(19);
  if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
  return env.DB.prepare(`SELECT u.id AS user_id,u.username,u.role,s.id AS session_id,s.profile_id,s.token_hash
    FROM account_sessions s JOIN account_users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>? AND u.disabled=0`).bind(await digest(token),Date.now()).first();
}
export async function requiredSession(request,env) {
  const user=await session(request,env);if(!user)throw new HttpError(401,'Entre novamente para continuar.');return user;
}
export async function limit(env,key,max=5) {
  const now=Date.now();
  const row=await env.DB.prepare(`INSERT INTO account_limits(key,attempts,expires_at) VALUES (?,1,?)
    ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END,
    expires_at=CASE WHEN expires_at<=? THEN ? ELSE expires_at END RETURNING attempts`)
    .bind(key,now+900000,now,now,now+900000).first();
  if(row.attempts>max)throw new HttpError(429,'Muitas tentativas. Aguarde 15 minutos.');
}
export function audit(env,actor,action,target) {
  return env.DB.prepare('INSERT INTO account_audit(id,actor,action,target,created_at) VALUES (?,?,?,?,?)')
    .bind(crypto.randomUUID(),actor,action,target,Date.now());
}
