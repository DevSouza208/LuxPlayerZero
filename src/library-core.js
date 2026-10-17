/** Private starter source bootstrap: credentials only in Cloudflare secrets. */
import { authenticatedUser } from './auth-core.js';
import { permittedUrl, bridgeReady, apiError, apiOk, sameOriginPost } from './bridge-core.js';
import { snapshotReady, syncCatalog } from './catalog-snapshot.js';
const encoder=new TextEncoder();
async function hashSource(value,env){
  const key=await crypto.subtle.importKey('raw',encoder.encode(env.BRIDGE_ACCESS_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const output=new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value)));
  return [...output].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function starterUrl(env){
  if(!snapshotReady(env)||!env.LUX_STARTER_M3U_URL)return null;
  return permittedUrl(env.LUX_STARTER_M3U_URL,env).href;
}
export async function libraryStatus(request,env){
  if(!await authenticatedUser(request,env))return apiError(401,'Sessão necessária.');
  if(!bridgeReady(env)||!snapshotReady(env))return apiOk({configured:false,ready:false});
  let url;
  try{url=starterUrl(env)}catch{return apiOk({configured:false,ready:false})}
  if(!url)return apiOk({configured:false,ready:false});
  try{
    const hash=await hashSource(url,env);
    const row=await env.DB.prepare('SELECT catalog_id,item_count,synced_at FROM catalog_sources WHERE source_hash=?').bind(hash).first();
    return apiOk(row?{configured:true,ready:true,catalogId:row.catalog_id,itemCount:row.item_count,syncedAt:row.synced_at}
      :{configured:true,ready:false});
  }catch{return apiOk({configured:true,ready:false})}
}
export async function librarySync(request,env){
  if(!sameOriginPost(request))return apiError(403,'Origem não autorizada.');
  const user=await authenticatedUser(request,env);
  if(!user||user.role!=='admin')return apiError(403,'Somente administradores podem sincronizar.');
  let url;
  try{url=starterUrl(env)}catch{return apiError(503,'A fonte privada não foi configurada corretamente.')}
  if(!url)return apiError(503,'Configure LUX_STARTER_M3U_URL, BRIDGE_ALLOWED_HOSTS, BRIDGE_ACCESS_KEY, DB e CATALOG_BUCKET.');
  // Reutiliza o importador original com autenticação do cookie de sessão.
  const internal=new Request(request.url,{method:'POST',
    headers:{'origin':new URL(request.url).origin,'content-type':'application/json','cookie':request.headers.get('cookie')||''},
    body:JSON.stringify({url})});
  return syncCatalog(internal,env);
}
