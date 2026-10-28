import {apiError,apiOk,session} from './bridge-core.js';
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
  const data=await readCatalogManifest(env,id);if(!data)return apiError(404,'Atualize a lista uma vez para gerar sua versão.');
  const {fileKey,...manifest}=data;return apiOk(manifest);
 }catch{return apiError(503,'Não foi possível conferir a versão do catálogo.');}
}
