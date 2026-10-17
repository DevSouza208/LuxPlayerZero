import {HttpError,randomToken,digest,equal,hashPassword,audit} from './account-security.js';
const encoder=new TextEncoder(),alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes){let bits=0,value=0,out='';for(const b of bytes){value=(value<<8)|b;bits+=8;while(bits>=5){out+=alphabet[(value>>>(bits-5))&31];bits-=5}}if(bits)out+=alphabet[(value<<(5-bits))&31];return out}
function unbase32(text){let bits=0,value=0,out=[];for(const char of text){const v=alphabet.indexOf(char);if(v<0)throw Error('Invalid base32');value=(value<<5)|v;bits+=5;if(bits>=8){out.push((value>>>(bits-8))&255);bits-=8}}return new Uint8Array(out)}
async function key(env){return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',encoder.encode(env.LUX_AUTH_PEPPER+'|mfa-encryption')),'AES-GCM',false,['encrypt','decrypt'])}
async function seal(secret,env){const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(env),encoder.encode(secret)));return JSON.stringify({iv:[...iv],cipher:[...cipher]})}
async function open(value,env){const {iv,cipher}=JSON.parse(value);return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(iv)},await key(env),new Uint8Array(cipher)))}
export async function totp(secret,step,digits=6){
 const counter=new Uint8Array(8);new DataView(counter.buffer).setBigUint64(0,BigInt(step));
 const key=await crypto.subtle.importKey('raw',unbase32(secret),{name:'HMAC',hash:'SHA-1'},false,['sign']);
 const hash=new Uint8Array(await crypto.subtle.sign('HMAC',key,counter)),offset=hash[hash.length-1]&15;
 const code=((hash[offset]&127)<<24)|(hash[offset+1]<<16)|(hash[offset+2]<<8)|hash[offset+3];
 return String(code%(10**digits)).padStart(digits,'0');
}
async function consumeTotp(env,userId,row,code){
 if(!/^\d{6}$/.test(String(code||'')))return false;
 const secret=await open(row.secret,env),step=Math.floor(Date.now()/30000);
 for(const offset of [-1,0,1])if(step+offset>row.last_step&&equal(await totp(secret,step+offset),code)){
  const result=await env.DB.prepare('UPDATE account_mfa SET last_step=? WHERE user_id=? AND last_step<?').bind(step+offset,userId,step+offset).run();
  return Boolean(result.meta.changes);
 }
 return false;
}
export async function verifyMfa(env,userId,code){
 const row=await env.DB.prepare('SELECT * FROM account_mfa WHERE user_id=? AND enabled=1').bind(userId).first();
 if(!row)return true;
 if(await consumeTotp(env,userId,row,code))return true;
 if(typeof code==='string'&&/^[a-f0-9]{32}$/.test(code)){
  const result=await env.DB.prepare('DELETE FROM account_recovery_codes WHERE user_id=? AND code_hash=?').bind(userId,await digest(code)).run();return Boolean(result.meta.changes);
 }
 return false;
}
export async function mfaAction(env,user,body){
 if(user.role!=='admin')throw new HttpError(403,'A configuração de 2FA é exclusiva do administrador.');
 const row=await env.DB.prepare('SELECT * FROM account_users WHERE id=?').bind(user.user_id).first();
 if(typeof body.password!=='string'||body.password.length>256||!equal(await hashPassword(body.password,row.salt,env),row.password_hash))throw new HttpError(403,'Confirme a senha atual.');
 const existing=await env.DB.prepare('SELECT * FROM account_mfa WHERE user_id=?').bind(user.user_id).first();
 if(body.action==='begin'){
  if(existing?.enabled)throw new HttpError(409,'2FA já está ativo.');
  const secret=base32(crypto.getRandomValues(new Uint8Array(20)));
  await env.DB.prepare('INSERT INTO account_mfa(user_id,secret) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET secret=excluded.secret,last_step=-1').bind(user.user_id,await seal(secret,env)).run();
  return {secret,uri:'otpauth://totp/Lux:'+encodeURIComponent(user.username)+'?secret='+secret+'&issuer=Lux&algorithm=SHA1&digits=6&period=30'};
 }
 if(body.action==='confirm'){
  if(!existing||existing.enabled||!await consumeTotp(env,user.user_id,existing,body.code))throw new HttpError(400,'Código inválido ou expirado.');
  const recovery=Array.from({length:8},()=>randomToken().slice(0,32));
  const statements=[env.DB.prepare('UPDATE account_mfa SET enabled=1 WHERE user_id=?').bind(user.user_id),env.DB.prepare('DELETE FROM account_recovery_codes WHERE user_id=?').bind(user.user_id)];
  for(const code of recovery)statements.push(env.DB.prepare('INSERT INTO account_recovery_codes(user_id,code_hash) VALUES (?,?)').bind(user.user_id,await digest(code)));
  statements.push(env.DB.prepare('DELETE FROM account_sessions WHERE user_id=? AND id<>?').bind(user.user_id,user.session_id||''));
  statements.push(audit(env,user.user_id,'mfa.enable',user.user_id));await env.DB.batch(statements);return {enabled:true,recovery};
 }
 throw new HttpError(400,'Ação inválida.');
}
