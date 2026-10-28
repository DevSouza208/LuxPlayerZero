import {createBridge} from './gateway.js';
import {createLocalData} from './local-data.js';
import {canonicalTvName} from './tv-normalizer.js';
import {normalizeSearchText} from './media-taxonomy.js';
const DAY=86400000;
const safeId=value=>typeof value==='number'||typeof value==='string'?(/^[a-z0-9_.:-]{1,160}$/i.test(String(value))?String(value):null):null;
const label=value=>typeof value==='string'&&value.trim()&&value.length<=240&&!/[\x00-\x1f]|https?:\/\//i.test(value)?value.trim():'';
const channelName=value=>normalizeSearchText(canonicalTvName(value));
const epgKey=value=>{const key=String(value||'').trim().toLowerCase();return /^(?:0|none|null|undefined|unknown|n\/a|-)$/.test(key)?'':key};
export function liveStreamIdentity(entry){
 try{const url=new URL(entry.url),parts=url.pathname.split('/').filter(Boolean);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||parts.length!==4||parts[0]!=='live')return null;
  const username=decodeURIComponent(parts[1]),password=decodeURIComponent(parts[2]);if(!username||!password||username.length>256||password.length>256||/[\x00-\x1f]/.test(username+password))return null;
  return {origin:url.origin,host:url.host.toLowerCase(),username,password,id:safeId(decodeURIComponent(parts[3]).replace(/\.(?:m3u8|ts|mp4|mkv|avi)$/i,''))};
 }catch{return null}
}
export function providerIdentity(groups,sourceHint=''){
 let identity=null;for(const group of groups){for(const variant of group.variants||[{item:group.primary}]){identity=liveStreamIdentity(variant.item);if(identity)break}if(identity)break}if(!identity)return null;
 const result={...identity,mediaHost:identity.host};
 try{const hint=new URL(sourceHint);if(['http:','https:'].includes(hint.protocol)&&!hint.username&&!hint.password&&!hint.hash&&/^\/(?:get|player_api)\.php$/.test(hint.pathname)&&hint.searchParams.get('username')===identity.username&&hint.searchParams.get('password')===identity.password)result.origin=hint.origin}catch{/* The stream identity remains usable without a playlist URL. */}
 return result;
}
export function sanitizeProviderCategories(categories,streams){
 if(!Array.isArray(categories)||categories.length>2000||!Array.isArray(streams)||streams.length>30000)throw Error('Categorias detalhadas não disponibilizadas pelo fornecedor.');
 const cleaned=categories.map(row=>({category_id:safeId(row?.category_id),category_name:label(row?.category_name)})).filter(row=>row.category_id&&row.category_name);
 if(!cleaned.length)throw Error('O fornecedor não retornou categorias detalhadas.');const ids=new Set(cleaned.map(row=>row.category_id));
 const channels=streams.map(row=>({stream_id:safeId(row?.stream_id),name:label(row?.name),epg_channel_id:label(row?.epg_channel_id),category_ids:[...new Set([row?.category_id,...(Array.isArray(row?.category_ids)?row.category_ids:[])].map(safeId).filter(id=>id&&ids.has(id)))]})).filter(row=>row.category_ids.length&&(row.stream_id||row.name||row.epg_channel_id));
 return {categories:cleaned,streams:channels};
}
export function categoriesForEntries(groups,metadata,identity){
 const categories=new Map(metadata.categories.map(row=>[row.category_id,row.category_name])),byId=new Map(),byEpg=new Map(),byName=new Map();
 const add=(map,key,names)=>{if(!key)return;const values=map.get(key)||new Set();for(const name of names)values.add(name);map.set(key,values)};
 for(const row of metadata.streams){const names=row.category_ids.map(id=>categories.get(id)).filter(Boolean);add(byId,row.stream_id,names);add(byEpg,epgKey(row.epg_channel_id),names);add(byName,channelName(row.name),names)}
 const result=new Map();for(const group of groups)for(const variant of group.variants||[{item:group.primary}]){
  const item=variant.item,source=liveStreamIdentity(item);if(!source||source.host!==identity.mediaHost||source.username!==identity.username||source.password!==identity.password)continue;
  const epg=epgKey(item.epgId||item.tvgId);let names=byId.get(source.id);
  if(!names){const candidate=byEpg.get(epg);if(candidate?.size===1)names=candidate}
  if(!names){const candidate=byName.get(channelName(item.name));if(candidate?.size===1)names=candidate}
  if(names?.size)result.set(item.id,[...names]);
 }return result;
}
export function attachProviderCategories(groups,byItem){
 return groups.map(group=>{const rows=[];for(const variant of group.variants||[{item:group.primary}])for(const name of byItem.get(variant.item.id)||[])rows.push({name,item:variant.item});return rows.length?{...group,providerCategoryEntries:rows}:group});
}
export function createTvProviderCategoryClient({read,storage=createLocalData(),profileId=()=>null,now=Date.now,hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('')}={}){
 const bridge=read?null:createBridge();const request=read||((url)=>bridge.catalog(url));const memory=new Map(),pending=new Map();
 async function readJson(url){const value=await request(url);if(typeof value==='string'){if(value.length>20*1024*1024)throw Error('Resposta de categorias muito grande.');return JSON.parse(value)}return value}
 return {async load(groups,sourceHint=''){
  const identity=providerIdentity(groups,sourceHint);if(!identity)return {available:false,reason:'A fonte não informa identificação Xtream para buscar os grupos detalhados.'};
  const key='tv-provider-categories:'+await hash(JSON.stringify([profileId(),identity.origin,identity.mediaHost,identity.username,identity.password]));
  const apply=data=>({available:true,byItem:categoriesForEntries(groups,data,identity)});
  const hit=memory.get(key);if(hit?.expires>now())return hit.data?apply(hit.data):{available:false,reason:hit.reason};
  if(pending.has(key)){const result=await pending.get(key);return result.data?apply(result.data):{available:false,reason:result.reason}}
  const work=(async()=>{
   try{const saved=await storage.get(key);if(saved?.expires>now()){const data=sanitizeProviderCategories(saved.data.categories,saved.data.streams);memory.set(key,{data,expires:saved.expires});return {data}}}catch{/* Cache is optional. */}
   try{
    const urls=['get_live_categories','get_live_streams'].map(action=>{const url=new URL('/player_api.php',identity.origin);url.searchParams.set('username',identity.username);url.searchParams.set('password',identity.password);url.searchParams.set('action',action);return url.href});
    const [categories,streams]=await Promise.all(urls.map(readJson));const data=sanitizeProviderCategories(categories,streams),expires=now()+DAY;
    memory.set(key,{data,expires});try{await storage.set(key,{data,expires})}catch{/* Browser quota never blocks the available metadata. */}return {data};
   }catch{const reason='Não foi possível obter os grupos detalhados do fornecedor. Os grupos da M3U foram mantidos.';memory.set(key,{reason,expires:now()+300000});return {reason}}
  })().finally(()=>pending.delete(key));pending.set(key,work);const result=await work;return result.data?apply(result.data):{available:false,reason:result.reason};
 }};
}
