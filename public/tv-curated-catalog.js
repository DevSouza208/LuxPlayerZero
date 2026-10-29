import {canonicalTvName} from './tv-normalizer.js';
import {normalizeSearchText} from './media-taxonomy.js';
import {channelCountry} from './tv-feature-model.js';

const HIDDEN_GROUPS=new Set(['Informações da lista','Outros','Rádios']);
export function visibleTvCategoryGroups(index){
 const categories=index.categories.filter(row=>!HIDDEN_GROUPS.has(row.label)),visible=new Set(categories.flatMap(row=>row.channels));
 return {...index,categories,groups:index.groups.filter(group=>visible.has(group.primary)),channels:index.channels.filter(item=>visible.has(item))};
}
const ID=/^[a-z0-9_.:-]{1,160}$/i;
const label=value=>typeof value==='string'&&value.trim()&&value.length<=240&&!/[\x00-\x1f]|https?:\/\//i.test(value);
function nameKey(value){
 let name=String(value||'').replace(/[²³]/g,'').replace(/\s*\(BR\d+\)\s*$/i,'');
 for(let i=0;i<4;i++)name=canonicalTvName(name).replace(/\s*(?:hevc|h26[45])\s*$/i,'');
 return normalizeSearchText(name);
}
export function providerChannelId(item){
 try{const url=new URL(item?.url);if(!/^https?:$/.test(url.protocol))return '';const id=decodeURIComponent(url.pathname.split('/').pop()).replace(/\.[^.]+$/,'');return ID.test(id)?id:''}catch{return ''}
}
export function parseTvCuratedCatalog(value){
 if(value?.versao!==1||!Array.isArray(value.canais)||value.canais.length>10000||!Array.isArray(value.grupos)||value.grupos.length>100)throw Error('Mapa de canais inválido.');
 const byId=new Map(),byName=new Map(),order=new Map();
 for(const group of value.grupos){
  if(!label(group.nome)||!Array.isArray(group.subgrupos)||group.subgrupos.length>200||order.has(group.nome))throw Error('Grupo de canais inválido.');
  if(group.subgrupos.some(row=>!label(row.nome)))throw Error('Subgrupo de canais inválido.');
  order.set(group.nome,group.subgrupos.map(row=>row.nome));
 }
 for(const row of value.canais){
  if(typeof row.id!=='string'||!ID.test(row.id)||!label(row.nome)||!label(row.grupo)||!label(row.subgrupo)||typeof row.visivel!=='boolean'||byId.has(row.id)||!order.get(row.grupo)?.includes(row.subgrupo))throw Error('Canal inválido no mapa.');
  const entry={group:row.grupo,subgroup:row.subgrupo,visible:row.visivel};byId.set(row.id,entry);
  const key=nameKey(row.nome);if(!key)continue;
  if(!byName.has(key))byName.set(key,entry);
  else {const prior=byName.get(key);if(prior&&(prior.group!==entry.group||prior.subgroup!==entry.subgroup||prior.visible!==entry.visible))byName.set(key,null)}
 }
 return {byId,byName,order};
}
export function curatedTvGroups(sourceGroups,catalog){
 const categories=new Map([...catalog.order].map(([label])=>[label,{key:'curated:'+label,label,groups:[],channels:[],subgroups:[]} ])),groups=[],channels=[];
 for(const original of sourceGroups||[]){
  const variants=original.variants?.map(row=>row.item)||[original.primary];
  const entries=[original.primary,...variants.filter(item=>item!==original.primary)].filter(Boolean);
  let chosen=null,metadata=null;
  for(const item of entries){
   if(channelCountry(item.name,item.group).international)continue;
   const row=catalog.byId.get(providerChannelId(item))||catalog.byName.get(nameKey(item.name));
   if(row?.visible===false||HIDDEN_GROUPS.has(row?.group))continue;
   // Prefer a mapped visible source; never invent a playable channel from the JSON.
   if(!chosen){chosen=item;metadata=row||null}
   if(row){chosen=item;metadata=row;break}
  }
  if(!chosen)continue;
  const group=chosen===original.primary?original:{...original,primary:chosen};groups.push(group);channels.push(chosen);
  const label=metadata?.group||'Outros',subLabel=metadata?.subgroup||'Não mapeados';
  let category=categories.get(label);if(!category){category={key:'curated:'+label,label,groups:[],channels:[],subgroups:[]};categories.set(label,category)}
  category.groups.push(group);category.channels.push(chosen);
  let sub=category.subgroups.find(row=>row.label===subLabel);
  if(!sub){sub={key:subLabel,label:subLabel,groups:[],channels:[]};category.subgroups.push(sub)}sub.groups.push(group);sub.channels.push(chosen);
 }
 for(const category of categories.values()){
  const order=catalog.order.get(category.label)||[];category.subgroups.sort((a,b)=>(order.includes(a.label)?order.indexOf(a.label):999)-(order.includes(b.label)?order.indexOf(b.label):999));
 }
 return visibleTvCategoryGroups({groups,channels,categories:[...categories.values()].filter(row=>row.channels.length)});
}
export function createTvCuratedLoader({fetcher=fetch,now=()=>Date.now()}={}){
 let pending=null,nextTry=0;
 return ()=>{
  if(pending)return pending;if(now()<nextTry)return Promise.reject(Error('Mapa de canais temporariamente indisponível.'));
  pending=(async()=>{const response=await fetcher('/data/tv-channel-groups.json',{credentials:'omit',signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error('Mapa de canais indisponível.');return parseTvCuratedCatalog(await response.json())})().catch(error=>{pending=null;nextTry=now()+30000;throw error});return pending;
 };
}
