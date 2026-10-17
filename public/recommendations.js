/** Deterministic, local, explainable recommendations from declared catalogue genres. */
import {itemKey,classifyItem} from './home-model.js';
export function recommendationIndex(items) {
 const genres=new Map();
 for(const item of items){
  if(classifyItem(item)==='tv')continue;
  for(const genre of new Set(item.catalogGenreIds||[])){
   let bucket=genres.get(genre);if(!bucket){bucket=[];genres.set(genre,bucket)}bucket.push(item);
  }
 }
 return genres;
}
export function recommend(index,seeds,{watched=new Set(),limit=16,enabled=true}={}) {
 if(!enabled)return [];
 const scored=new Map(),seedKeys=new Set(seeds.map(itemKey));
 for(const seed of seeds.slice(0,5)){
  for(const genre of seed.catalogGenreIds||[]){
   // Bound work for very broad genres. This is relevance, not a popularity ranking.
   for(const candidate of (index.get(genre)||[]).slice(0,5000)){
    const key=itemKey(candidate);if(seedKeys.has(key)||watched.has(key))continue;
    const previous=scored.get(key)||{item:candidate,score:0,reason:seed.displayName||seed.name};
    previous.score++;scored.set(key,previous);
   }
  }
 }
 return [...scored.values()].sort((a,b)=>b.score-a.score||String(a.item.name).localeCompare(String(b.item.name),'pt-BR')).slice(0,limit);
}
