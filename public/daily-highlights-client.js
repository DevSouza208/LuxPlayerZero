import {localData} from './local-data.js';
import {cleanHighlights} from './daily-highlights-model.js';
export function createDailyHighlightsClient({profileId,onChange,fetcher=fetch,store=localData,now=Date.now}={}){
 const key='daily-highlights:'+profileId;let selection=null,checkedAt=0,pending;
 async function accept(value){selection=value?cleanHighlights(value):null;onChange(selection);await store.set(key,{selection,checkedAt}).catch(()=>{});}
 async function load(){
  if(pending)return pending;
  if(checkedAt&&now()-checkedAt<3600000)return selection;
  pending=(async()=>{
   if(!checkedAt){const saved=await store.get(key).catch(()=>null);if(saved?.selection){try{selection=cleanHighlights(saved.selection);onChange(selection);checkedAt=Number(saved.checkedAt)||0;}catch{}}}
   if(checkedAt&&now()-checkedAt<3600000)return selection;
   const response=await fetcher('/api/editorial/daily-highlights',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(8000)});
   if(!response.ok)throw Error('Destaques indisponíveis');
   const data=await response.json();const safe=data.selection?cleanHighlights(data.selection):null;checkedAt=now();await accept(safe);return selection;
  })().catch(()=>selection).finally(()=>{pending=null});return pending;
 }
 return {load,async published(value){checkedAt=now();await accept(value);}};
}
