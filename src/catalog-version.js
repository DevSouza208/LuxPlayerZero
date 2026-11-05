import {apiError,apiOk,session,permittedUrl} from './bridge-core.js';
import {usuarioSession,hasUsuarios} from './usuarios-auth.js';
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const versionKey=id=>'catalogos/'+id+'/manifest.json';
export async function readCatalogManifest(env,id){
 if(!ID.test(id||''))return null;
 const file=await env.CATALOG_BUCKET.get(versionKey(id));if(!file)return null;
 const value=JSON.parse(await new Response(file.body).text());
 if(value.schemaVersion!==1||value.catalogId!==id||!/^[a-f0-9]{64}$/.test(value.contentVersion)||!Number.isSafeInteger(value.itemCount)||value.itemCount<1||!Number.isSafeInteger(value.bytes)||value.bytes<1||!new RegExp('^catalogos/'+id+'/[a-f0-9-]+\\.m3u$','i').test(value.fileKey))throw Error('Manifesto inválido.');
 return value;
}
export async function serveCatalogVersion(request,env){
 if(request.method!=='GET')return apiError(405,'Método não permitido.');
 if(!env.CATALOG_BUCKET?.get)return apiError(503,'Catálogo indisponível.');
 try{
  if(!await session(request,env))return apiError(401,'Entre na sua conta para verificar o catálogo.');
  const id=new URL(request.url).searchParams.get('id');if(!ID.test(id||''))return apiError(400,'Catálogo inválido.');
  if(await hasUsuarios(env)){
    const user=await usuarioSession(request,env);
    if(!user)return apiError(401,'Sessão necessária.');
    const row=await env.DB.prepare('SELECT lista_http,lista_https FROM usuarios WHERE id=?').bind(user.usuario_id).first();
    let owns=false;
    for(const raw of [row?.lista_https,row?.lista_http].filter(Boolean)){
      try{
        const url=permittedUrl(raw,env).href;
        const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.BRIDGE_ACCESS_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);
        const hash=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(url))),n=>n.toString(16).padStart(2,'0')).join('');
        if(await env.DB.prepare('SELECT 1 FROM catalog_sources WHERE source_hash=? AND catalog_id=?').bind(hash,id).first()){owns=true;break;}
      }catch{}
    }
    if(!owns)return apiError(403,'Esta lista não pertence à sua conta.');
  }
  const data=await readCatalogManifest(env,id);if(!data)return apiError(404,'Atualize a lista uma vez para gerar sua versão.');
  const {fileKey,...manifest}=data;return apiOk(manifest);
 }catch{return apiError(503,'Não foi possível conferir a versão do catálogo.');}
}
