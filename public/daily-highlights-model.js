import {vodRecord} from './vod-model.js';
export const highlightDay=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
export function highlightImage(value){
 return typeof value==='string'&&/^https:\/\/image\.tmdb\.org\/t\/p\/(?:w500|w1280|original)\/[a-zA-Z0-9_-]+\.(?:jpg|png|webp)$/.test(value)?value:'';
}
export function cleanHighlights(value){
 if(!value||value.version!==1||typeof value.id!=='string'||!/^[\w-]{1,80}$/.test(value.id)||!/^\d{4}-\d{2}-\d{2}$/.test(value.day))throw Error('Seleção de destaques inválida.');
 const result={version:1,id:value.id,day:value.day,createdAt:Number(value.createdAt)||0,publishedAt:Number(value.publishedAt)||0,movies:[],series:[]};
 for(const role of ['movies','series']){
  if(!Array.isArray(value[role])||value[role].length>6)throw Error('Seleção de destaques inválida.');
  const seen=new Set();
  for(const row of value[role]){
   if(!Number.isSafeInteger(row?.tmdbId)||row.tmdbId<1||typeof row.catalogId!=='string'||row.catalogId.length>260||!row.catalogId||typeof row.title!=='string'||!row.title.trim()||row.title.length>240||seen.has(row.tmdbId))throw Error('Título de destaque inválido.');
   seen.add(row.tmdbId);result[role].push({catalogId:row.catalogId,tmdbId:row.tmdbId,title:row.title.trim(),year:Number(row.year)||null,poster:highlightImage(row.poster),backdrop:highlightImage(row.backdrop),overview:typeof row.overview==='string'?row.overview.slice(0,3000):''});
  }
 }
 return result;
}
/** Resolve somente entradas realmente presentes; conserva objetos/URLs de reprodução. */
export function resolveHighlights(selection,catalogs){
 const result={movies:[],series:[],metadata:new Map()};if(!selection)return result;
 for(const role of ['movies','series']){
  const byId=new Map(),byTmdb=new Map();
  for(const item of catalogs[role]||[]){const record=vodRecord(item);if(record&&!byId.has(record.id))byId.set(record.id,item);if(item.tmdbId)byTmdb.set(Number(item.tmdbId),item);}
  for(const row of selection[role]||[]){const item=byId.get(row.catalogId)||byTmdb.get(row.tmdbId);if(!item||result[role].includes(item))continue;result[role].push(item);result.metadata.set(item,{status:'matched',...row});}
 }
 return result;
}
