import {normalizeSearchText,searchSimilarity} from './media-taxonomy.js';
/** Paginação de catálogos de grande porte — retorna só uma página de cards. */
export const CATALOG_PAGE_SIZE = 48;
export const BROWSE_ROUTES = Object.freeze({
  '#destaques-tv': 'tv',
  '#destaques-filmes': 'movies',
  '#destaques-series': 'series',
  '#minha-lista': 'favorites'
});
export function browseRoleFromHash(hash) {
  return BROWSE_ROUTES[String(hash || '')] || null;
}
const indexes=new WeakMap();
const collator=new Intl.Collator('pt-BR',{numeric:true,sensitivity:'base'});
const languages=new Set(['Dublado','Legendado','Original']);
function indexFor(source){
 let index=indexes.get(source);if(index&&index.length===source.length)return index;
 const years=new Set(),genres=new Set(),audio=new Set();
 const rows=source.map(item=>{
  const year=Number(item.catalogYear)||0,tags=item.catalogTags||[],genreIds=item.catalogGenreIds||[];
  if(year)years.add(year);for(const id of genreIds)genres.add(id);for(const tag of tags)if(languages.has(tag))audio.add(tag);
  return {item,year,genreIds,tags,title:item.displayName || item.name||'',group:String(item.normalizedGroup||item.group||''),
   search:normalizeSearchText([item.displayName || item.name,item.name,item.group,...tags].join(' '))};
 });
 index={length:source.length,rows,facets:{years:[...years].sort((a,b)=>b-a),genres:[...genres].sort(),languages:[...audio].sort()},key:null,matched:null};
 indexes.set(source,index);return index;
}
export function browseFacets(entries){return indexFor(entries).facets;}
export function browsePageData(entries, { page = 1, query = '', group = '', year='',genre='',language='',sort='source', pageSize = CATALOG_PAGE_SIZE } = {}) {
 const source=Array.isArray(entries)?entries:[],index=indexFor(source),search=normalizeSearchText(query);
 const requestedGroup=String(group||'').trim(),requestedYear=Number(year)||0;
 const key=JSON.stringify([search,requestedGroup,requestedYear,genre,language,sort]);
 let matched=index.key===key?index.matched:null;
 if(!matched){
  const allowed=row=>(!requestedGroup||row.group===requestedGroup)&&(!requestedYear||row.year===requestedYear)&&(!genre||row.genreIds.includes(genre))&&(!language||row.tags.includes(language));
  matched=index.rows.filter(row=>allowed(row)&&(!search||row.search.includes(search)));
  // Fuzzy search never bypasses a chosen filter or scans very large catalogs.
  if(search&&matched.length<6&&source.length<=35000){
   const seen=new Set(matched);
   for(const row of index.rows){if(!seen.has(row)&&allowed(row)&&searchSimilarity(row.title,query)>=.89){matched.push(row);if(matched.length>=40)break;}}
  }
  if(sort==='title')matched.sort((a,b)=>collator.compare(a.title,b.title));
  else if(sort==='year')matched.sort((a,b)=>b.year-a.year||collator.compare(a.title,b.title));
  index.key=key;index.matched=matched;
 }
 const size=Math.max(1,Math.min(72,Math.floor(Number(pageSize)||CATALOG_PAGE_SIZE))),pageCount=Math.max(1,Math.ceil(matched.length/size));
 const selected=Number.isFinite(Number(page))?Math.min(pageCount,Math.max(1,Math.trunc(Number(page)))):1;
 return {entries:matched.slice((selected-1)*size,selected*size).map(row=>row.item),page:selected,pageCount,total:matched.length,
  start:matched.length?(selected-1)*size+1:0,end:Math.min(selected*size,matched.length)};
}
export function browseGroups(entries, max = 70) {
  const counts = new Map();
  for (const entry of entries || []) {
    const name = String(entry.normalizedGroup || entry.group || '').trim();
    if (name) counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, max);
}
