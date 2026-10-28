import {localData} from './local-data.js';
const schemaVersion=1;
export async function libraryCacheKey(profileId,source){
 if(!profileId||!source)throw Error('Biblioteca sem perfil.');
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(profileId+'\n'+source));
 return 'catalog:'+Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
}
function valid(row){return row?.schemaVersion===schemaVersion&&Array.isArray(row.items)&&row.items.length>0&&row.items.every(item=>typeof item.name==='string'&&typeof item.url==='string'&&/^https?:\/\//i.test(item.url));}
/** One atomic record swap; old data is never deleted before a validated replacement. */
export function createLibraryCache({storage=localData,fetcher=fetch,now=Date.now}={}){
 async function activate(profileId,key,catalogId){try{await storage.set('active-catalog:'+profileId,{key,catalogId})}catch{}}
 async function load({profileId,source,catalogId,cacheKey,download,prepare,onCached=()=>{},onWarning=()=>{},retried=false}){
  const key=cacheKey||await libraryCacheKey(profileId,source);let cached;
  try{const value=await storage.get(key);if(valid(value)&&(!value.profileId||value.profileId===profileId))cached=value;}catch{}
  if(cached){onCached(cached.items);await activate(profileId,key,catalogId);}
  let manifest=null;
  try{
   if(catalogId){
    const response=await fetcher('/api/bridge/catalog-version?id='+encodeURIComponent(catalogId),{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(response.status===401||response.status===403)throw Object.assign(Error('Entre novamente para atualizar a biblioteca.'),{auth:true});
    if(response.ok){const data=await response.json();if(data.schemaVersion!==1||data.catalogId!==catalogId||!/^[a-f0-9]{64}$/.test(data.contentVersion)||!Number.isSafeInteger(data.itemCount)||data.itemCount<1)throw Error('Versão do catálogo inválida.');manifest=data;}
    else if(response.status!==404)throw Error('Não foi possível verificar a atualização do catálogo.');
   }
   if(cached&&manifest?.contentVersion===cached.contentVersion)return {items:cached.items,changed:false,cached:true};
   // Old snapshots/providers without a version endpoint are rechecked once per day.
   if(cached&&!manifest&&now()-cached.checkedAt<86400000)return {items:cached.items,changed:false,cached:true};
   const content=await download(manifest?.contentVersion||null);
   if(manifest){let count=0;const lines=/^[ \t]*#EXTINF:/gm;while(lines.exec(content))count++;if(count!==manifest.itemCount)throw Error('Download incompleto. A biblioteca anterior foi mantida.');}
   const items=await prepare(content);if(!Array.isArray(items)||!items.length)throw Error('A lista recebida está vazia.');
   const next={schemaVersion,profileId,catalogId,contentVersion:manifest?.contentVersion||null,checkedAt:now(),items};
   try{await storage.set(key,next);await activate(profileId,key,catalogId)}catch{onWarning('Lista carregada, mas o dispositivo não conseguiu guardar uma cópia em cache.');}
   return {items,changed:true,cached:false};
  }catch(error){
   if(error.auth)throw error;
   if(error.status===409&&!retried)return load({profileId,source,catalogId,cacheKey,download,prepare,onCached,onWarning,retried:true});
   if(cached){onWarning('Usando a cópia salva. A atualização será conferida na próxima abertura.');return {items:cached.items,changed:false,cached:true};}
   throw error;
  }
 }
 load.remember=async({profileId,source='manual',catalogId=null,items,localOnly=!catalogId})=>{
  const key=await libraryCacheKey(profileId,source),row={schemaVersion,profileId,catalogId,localOnly,items,checkedAt:now(),contentVersion:null};
  if(!valid(row))throw Error('Biblioteca inválida.');await storage.set(key,row);await activate(profileId,key,catalogId);return true;
 };
 load.restore=async profileId=>{
  try{const ref=await storage.get('active-catalog:'+profileId);if(!ref)return null;const row=await storage.get(ref.key);return valid(row)&&row.profileId===profileId?{...row,key:ref.key}:null;}catch{return null;}
 };
 load.forget=async profileId=>{
  const row=await load.restore(profileId);if(row)await storage.remove(row.key);await storage.remove('active-catalog:'+profileId);
 };
 return load;
}
