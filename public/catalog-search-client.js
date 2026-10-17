import {savedSnapshot} from './saved-catalog.js';
/** Optional secondary index. Reject stale mappings; never receive or construct stream URLs. */
export function createCatalogSearch(fetcher=fetch) {
 let controller=null,serial=0;const cache=new Map();
 return async function search(query,page,items){
  const catalogId=savedSnapshot();if(!catalogId)return null;
  const key=[catalogId,query,page].join('|');if(cache.has(key))return cache.get(key);
  controller?.abort();controller=new AbortController();const requestController=controller,current=++serial;
  const timer=setTimeout(()=>requestController.abort(),5000);
  try{
   const r=await fetcher('/api/catalog/search?'+new URLSearchParams({catalogId,kind:'movies',q:query,page:String(page)}),{credentials:'same-origin',cache:'no-store',signal:requestController.signal});
   if(!r.ok||serial!==current)return null;const data=await r.json();
   if(!data.ready)return null;
   const entries=data.entries.map(row=>items[row.ordinal]);
   if(entries.some((item,i)=>!item||item.name.slice(0,240)!==data.entries[i].title))return null;
   const count=Math.max(1,Math.ceil(data.total/48));const result={entries,total:data.total,page:data.page,pageCount:count,start:data.total?(data.page-1)*48+1:0,end:Math.min(data.page*48,data.total)};
   if(cache.size>=8)cache.delete(cache.keys().next().value);cache.set(key,result);return result;
  }catch{return null}finally{clearTimeout(timer)}
 };
}
