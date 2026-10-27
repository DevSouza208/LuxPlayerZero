import {parseM3u} from './playlist.js';
import {presentationForEntry,deriveCatalogPresentation} from './cinema-title.js';
import {classifyItem} from './home-model.js';
import {parseEpisodeLabel} from './cinema-series.js';
import {normalizeSearchText} from './media-taxonomy.js';

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
 const shown=presentationForEntry(entry);
 const episode=type==='series'?parseEpisodeLabel(shown.displayName||entry.name):null;
 const clean=deriveCatalogPresentation(episode?.showTitle||entry.seriesName||shown.displayName||entry.name);
 const titulo=clean.title.trim().slice(0,240),normalized=normalizeSearchText(titulo);
 if(!normalized)return null;
 const ano=clean.year||shown.catalogYear||null;
 return {tipo:type==='movies'?'filmes':'series',id:normalized+'|'+(ano||''),titulo,titulo_normalizado:normalized,ano,
  nome_original:episode?.showTitle||entry.seriesName||entry.name.slice(0,240),...providerReference(entry,type),
  referencias:[providerReference(entry,type)].filter(ref=>ref.id_provedor),
  tags_fonte:[...new Set([...(shown.catalogTags||[]),...(clean.tags||[])])].slice(0,24)};
}
export function uniqueVod(entries){
 const filmes=new Map(),series=new Map();
 for(const entry of entries){const record=vodRecord(entry);if(!record)continue;const map=record.tipo==='filmes'?filmes:series;
  const previous=map.get(record.id);if(previous){record.tags_fonte=[...new Set([...previous.tags_fonte,...record.tags_fonte])].slice(0,24);record.referencias=[...new Map([...previous.referencias,...record.referencias].map(ref=>[ref.fornecedor+'|'+ref.id_provedor,ref])).values()];}map.set(record.id,record);}
 return {filmes:[...filmes.values()],series:[...series.values()]};
}
/** Retoma pela última URL completa. Uma EXTINF cortada será lida novamente. */
export function readVodChunk(bytes,{group='',final=false}={}){
 const decoder=new TextDecoder();let begin=0,consumed=0,header='',override=false,nextGroup=group,committed=group,count=0;
 const entries=[];
 for(let i=0;i<=bytes.length;i++){
  if(i===bytes.length&&!final)break;
  if(i<bytes.length&&bytes[i]!==10)continue;
  const line=decoder.decode(bytes.subarray(begin,i)).trim(),end=i<bytes.length?i+1:i;begin=end;
  if(line.startsWith('#EXTINF:')){header=line;override=false;}
  else if(line.startsWith('#EXTGRP:')){nextGroup=line.slice(8).trim();if(header)override=true;}
  else if(line&&!line.startsWith('#')){
   const entry=parseM3u('#EXTM3U\n#EXTGRP:'+nextGroup+'\n'+(header?header+'\n':'')+(override?'#EXTGRP:'+nextGroup+'\n':'')+line)[0];
   if(entry){count++;entries.push(entry)}
   header='';consumed=end;committed=nextGroup;
  }else if(!header){consumed=end;committed=nextGroup;}
 }
 if(final&&begin>=bytes.length&&!header){consumed=bytes.length;committed=nextGroup;}
 return {...uniqueVod(entries),consumed,group:committed,count};
}
