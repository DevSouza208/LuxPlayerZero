/** No D1 counters. Native bindings are approximate per Cloudflare location;
 * the bounded fallback is per isolate, never a global billing ceiling. */
const policies = {
 account: {limit:120, binding:'ACCOUNT_REQUEST_LIMIT'},
 sync: {limit:30, binding:'PROFILE_SYNC_LIMIT'},
 metadata: {limit:600, binding:'METADATA_REQUEST_LIMIT'}
};
export function createRequestBudget({now=Date.now,maxKeys=8192}={}) {
 const windows=new Map();
 return async function check(env,identity,category='account') {
  const policy=policies[category];if(!policy)throw Error('Unknown request category');
  const key=category+':'+identity;let success;
  try {
   if(env[policy.binding]?.limit)({success}=await env[policy.binding].limit({key}));
  } catch {/* Availability fallback; counters never go to D1. */}
  if(typeof success!=='boolean') {
   const time=now();let row=windows.get(key);
   if(!row||row.until<=time)row={used:0,until:time+60000};
   if(row.used>=policy.limit)return limited(Math.ceil((row.until-time)/1000));
   row.used++;windows.delete(key);windows.set(key,row);
   while(windows.size>maxKeys)windows.delete(windows.keys().next().value);
   success=true;
  }
  return success?null:limited(60);
 };
}
function limited(seconds) {
 return Response.json({error:'Muitas solicitações. Tente novamente mais tarde.',retryAfter:Math.max(1,seconds)},
  {status:429,headers:{'retry-after':String(Math.max(1,seconds)),'cache-control':'no-store'}});
}
export const checkRequestBudget=createRequestBudget();
/** Metadata is public today. Hash session tokens, never store/log raw cookies.
 * This preliminary limit does not authenticate a token or grant private access. */
export async function metadataRequestBudget(request,env) {
 const path=new URL(request.url).pathname;
 if(!['/api/metadata/tmdb','/api/metadata/details'].includes(path)||request.method!=='POST')return null;
 const token=/(?:^|;\s*)__Host-lux_account=([a-f0-9]{64})(?:;|$)/.exec(request.headers.get('cookie')||'')?.[1];
 const value=token?'session:'+token:'anonymous:'+(request.headers.get('cf-connecting-ip')||'unknown');
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 const key=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
 return checkRequestBudget(env,key,'metadata');
}
