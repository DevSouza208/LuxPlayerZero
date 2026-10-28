import {parseM3u} from './playlist.js';
import {attachCinemaTmdbIds} from './cinema-tmdb-tags.js';
import {presentationForEntry} from './cinema-title.js';
const prepared=new WeakSet();
export function restorePreparedCatalog(items){prepared.add(items);return items;}
export const isPreparedCatalog=items=>prepared.has(items);
/** Same parser and display rules; original names, groups and URLs stay intact. */
export function prepareCatalogText(text,baseUrl){
 const entries=attachCinemaTmdbIds(text,parseM3u(text,baseUrl),baseUrl);
 return entries.map((item,index)=>({...item,id:'c'+index,...presentationForEntry(item)}));
}
export function createCatalogPreparer({WorkerClass=globalThis.Worker}={}){
 let sequence=0;
 return async function prepare(text,baseUrl){
  if(!WorkerClass){const items=prepareCatalogText(text,baseUrl);prepared.add(items);return items;}
  const id=++sequence;
  const items=await new Promise((resolve,reject)=>{
   let worker,settled=false,timer;
   const complete=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);worker?.terminate();if(error)reject(error);else resolve(value);};
   const fallback=()=>{worker?.terminate();try{complete(null,prepareCatalogText(text,baseUrl));}catch(error){complete(error)}};
   try{
    worker=new WorkerClass(new URL('./catalog-prepare-worker.js',import.meta.url),{type:'module'});
    worker.onmessage=event=>{if(event.data?.id!==id)return;if(event.data.error)complete(Error('Não foi possível interpretar a playlist.'));else if(Array.isArray(event.data.items))complete(null,event.data.items);else fallback();};
    worker.onerror=fallback;timer=setTimeout(fallback,120000);
    worker.postMessage({id,text,baseUrl});
   }catch{fallback();}
  });
  prepared.add(items);return items;
 };
}
