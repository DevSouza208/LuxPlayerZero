/** Índice local dos resultados TMDB; os arquivos de imagem ficam no Cache Storage. */
export function createArtworkMetadataCache(indexedDB=globalThis.indexedDB){
 let database;
 function open(){
  if(!indexedDB)return Promise.resolve(null);
  if(!database)database=new Promise(resolve=>{
   const request=indexedDB.open('luxzero-artwork-metadata',1);
   request.onupgradeneeded=()=>{const store=request.result.createObjectStore('matches',{keyPath:'key'});store.createIndex('savedAt','savedAt')};
   request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();database=null};resolve(request.result)};request.onerror=request.onblocked=()=>{database=null;resolve(null)};
  });
  return database;
 }
 return {
  async get(key){try{
   const db=await open();if(!db)return null;
   return await new Promise(resolve=>{const request=db.transaction('matches').objectStore('matches').get(key);request.onsuccess=()=>{const row=request.result;resolve(row&&Date.now()-row.savedAt<7*86400000?row.data:null)};request.onerror=()=>resolve(null)});
  }catch{return null}},
  async put(key,data){if(data?.status!=='matched')return;try{
   const db=await open();if(!db)return;
   await new Promise(resolve=>{const transaction=db.transaction('matches','readwrite'),store=transaction.objectStore('matches');
    store.put({key,data,savedAt:Date.now()});const count=store.count();count.onsuccess=()=>{if(count.result>1000){let excess=count.result-1000;const cursor=store.index('savedAt').openCursor();cursor.onsuccess=()=>{const row=cursor.result;if(row&&excess-->0){row.delete();row.continue()}}}};
    transaction.oncomplete=transaction.onerror=transaction.onabort=()=>resolve();});
  }catch{/* Quota local não impede consultas nem reprodução. */}}
 };
}
