/** Private browser cache, partitioned by authenticated profile/source. No localStorage. */
export function createLocalData(indexedDB=globalThis.indexedDB){
 let opening;
 async function open(){
  if(!indexedDB)throw Error('Armazenamento local indisponível.');
  if(!opening)opening=new Promise((resolve,reject)=>{
   const request=indexedDB.open('luxzero-private-cache',1);
   let expired=false;
   const timer=setTimeout(()=>{expired=true;reject(Error('Armazenamento local ocupado.'));},2500);
   request.onupgradeneeded=()=>request.result.createObjectStore('data');
   request.onsuccess=()=>{clearTimeout(timer);const db=request.result;if(expired){db.close();return;}db.onversionchange=()=>{db.close();opening=null};resolve(db)};
   request.onerror=request.onblocked=()=>{expired=true;clearTimeout(timer);opening=null;reject(Error('Armazenamento local indisponível.'))};
  }).catch(error=>{opening=null;throw error});
  return opening;
 }
 async function transaction(key,updater){
  const db=await open();return new Promise((resolve,reject)=>{
   const tx=db.transaction('data',updater?'readwrite':'readonly'),store=tx.objectStore('data'),get=store.get(key);let result;
   get.onsuccess=()=>{try{result=get.result??null;if(updater){result=updater(result);if(result===null)store.delete(key);else store.put(result,key)}}catch(error){tx.abort();reject(error)}};
   tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(Error('Não foi possível guardar os dados neste dispositivo.'));
  });
 }
 return {get:key=>transaction(key),set:(key,value)=>transaction(key,()=>value),update:(key,fn)=>transaction(key,fn),remove:key=>transaction(key,()=>null)};
}
export const localData=createLocalData();
