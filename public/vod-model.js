import {parseM3u} from './playlist.js';
import {deriveCatalogPresentation} from './cinema-title.js';
import {classifyItem} from './home-model.js';
import {parseEpisodeLabel} from './cinema-series.js';
import {normalizeSearchText,mediaFeatures} from './media-taxonomy.js';

export function providerReference(entry,type){
 let fornecedor='',id=null;
 try{const url=new URL(entry.url);fornecedor=url.host.toLowerCase();
  if(type==='movies')id=String(entry.streamId||entry.providerId||'')||url.pathname.match(/\/movie\/[^/]+\/[^/]+\/(\d+|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:\.[a-z0-9]+)?$/i)?.[1]||null;
  else id=entry.seriesId?String(entry.seriesId):null;
 }catch{}
 if(id&&!/^[a-z0-9_.:-]{1,160}$/i.test(id))id=null;
 return {id_provedor:id,fornecedor};
}
/** Somente títulos: não persiste episódios, URLs, credenciais ou linhas da M3U. */
export function vodRecord(entry){
 const type=classifyItem(entry);if(!['movies','series'].includes(type))return null;
 const shown=deriveCatalogPresentation(entry.name,entry.catalogYear??entry.year);
 const episode=type==='series'?parseEpisodeLabel(entry.displayName||shown.title):null;
 const clean=deriveCatalogPresentation(episode?.showTitle||entry.seriesName||entry.displayName||shown.title,shown.year);
 const titulo=clean.title.trim().slice(0,240),normalized=normalizeSearchText(titulo);
 if(!normalized)return null;
 const ano=clean.year||shown.year||null,reference=providerReference(entry,type);
 return {tipo:type==='movies'?'filmes':'series',id:normalized+'|'+(ano||''),titulo,titulo_normalizado:normalized,ano,
  nome_original:episode?.showTitle||entry.seriesName||entry.name.slice(0,240),...reference,
  referencias:reference.id_provedor?[reference]:[],
  tags_fonte:[...new Set([...(entry.catalogTags||mediaFeatures(entry.name+' '+(entry.group||''))),...shown.tags,...clean.tags])].slice(0,24)};
}
export function uniqueVod(entries){
 const filmes=new Map(),series=new Map();
 for(const entry of entries){const record=vodRecord(entry);if(!record)continue;const map=record.tipo==='filmes'?filmes:series;
  const previous=map.get(record.id);if(previous){record.tags_fonte=[...new Set([...previous.tags_fonte,...record.tags_fonte])].slice(0,24);record.referencias=[...new Map([...previous.referencias,...record.referencias].map(ref=>[ref.fornecedor+'|'+ref.id_provedor,ref])).values()];}map.set(record.id,record);}
 return {filmes:[...filmes.values()],series:[...series.values()]};
}
/** Retoma pela última URL completa. Uma EXTINF cortada será lida novamente. */
export function readVodChunk(bytes,{group='',final=false}={}){
 const decoder=new TextDecoder();let begin=0,consumed=0,header='',nextGroup=group,committed=group;
 for(let i=0;i<=bytes.length;i++){
  if(i===bytes.length&&!final)break;
  if(i<bytes.length&&bytes[i]!==10)continue;
  const line=decoder.decode(bytes.subarray(begin,i)).trim(),end=i<bytes.length?i+1:i;begin=end;
  if(line.startsWith('#EXTINF:')){header=line;}
  else if(line.startsWith('#EXTGRP:')){nextGroup=line.slice(8).trim();}
  else if(line&&!line.startsWith('#')){
   header='';consumed=end;committed=nextGroup;
  }else if(!header){consumed=end;committed=nextGroup;}
 }
 if(final&&begin>=bytes.length&&!header){consumed=bytes.length;committed=nextGroup;}
 const entries=parseM3u('#EXTM3U\n#EXTGRP:'+group+'\n'+decoder.decode(bytes.subarray(0,consumed)));
 return {...uniqueVod(entries),consumed,group:committed,count:entries.length};
}
