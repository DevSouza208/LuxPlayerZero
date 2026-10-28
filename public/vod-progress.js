import {uniqueVod} from './vod-model.js';
/** Prepara somente títulos e referências, sem enviar URLs de reprodução. */
export async function scanVod(items,{onProgress=()=>{},cancelled=()=>false}={}){
 const maps={filmes:new Map(),series:new Map()};
 for(let offset=0;offset<items.length;offset+=400){
  if(cancelled())throw Error('Scan interrompido. Nenhum dado foi apagado.');
  const batch=uniqueVod(items.slice(offset,offset+400));
  for(const tipo of ['filmes','series'])for(const row of batch[tipo]){
   const previous=maps[tipo].get(row.id);
   if(previous){previous.tags_fonte=[...new Set([...previous.tags_fonte,...row.tags_fonte])].slice(0,24);previous.referencias=[...new Map([...previous.referencias,...row.referencias].map(ref=>[ref.fornecedor+'|'+ref.id_provedor,ref])).values()];}
   else maps[tipo].set(row.id,row);
  }
  onProgress(Math.min(offset+400,items.length),items.length);
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 return {filmes:[...maps.filmes.values()],series:[...maps.series.values()]};
}
export function remainingTime(completed,total,elapsed){
 if(completed<=0||elapsed<1000)return 'calculando tempo…';
 const seconds=Math.max(0,Math.ceil((total-completed)*elapsed/completed/1000));
 return seconds<60?`~${seconds}s restantes`:`~${Math.ceil(seconds/60)}min restantes`;
}
