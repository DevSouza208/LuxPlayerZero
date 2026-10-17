/** Resolve metadata suggestions only against actual catalog entries, without URL changes. */
import {tmdbQueryForItem} from './tmdb-client.js';
import {normalizeSearchText} from './media-taxonomy.js';
export function relationIndex(items,role='movies'){
 const ids=new Map(),titles=new Map();
 for(const item of items){
  const query=tmdbQueryForItem(item,role);if(!query)continue;
  if(query.tmdbId){const rows=ids.get(query.tmdbId)||[];rows.push(item);ids.set(query.tmdbId,rows)}
  if(query.year){const key=normalizeSearchText(query.title)+':'+query.year;
   const rows=titles.get(key)||[];rows.push({item,id:query.tmdbId});titles.set(key,rows)}
 }
 return {ids,titles};
}
export function resolveRelations(index,rows,{excludeId,excludeItem,limit=12}={}){
 const result=[],seen=new Set();
 for(const row of rows||[]){
  if(!Number.isSafeInteger(row.id)||row.id<1||row.id===excludeId||seen.has(row.id))continue;
  seen.add(row.id);
  let candidates=index.ids.get(row.id)||[];
  if(!candidates.length&&/^\d{4}$/.test(String(row.year))){
   const matches=index.titles.get(normalizeSearchText(row.title)+':'+row.year)||[];
   // Explicit conflicting provider IDs make a title/year match unsafe.
   if(matches.some(match=>match.id&&match.id!==row.id))continue;
   candidates=matches.map(match=>match.item);
  }
  const item=candidates.find(candidate=>candidate!==excludeItem);if(!item)continue;
  result.push({item,title:row.title,year:row.year});if(result.length>=limit)break;
 }
 return result;
}
