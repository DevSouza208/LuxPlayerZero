import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendationIndex,recommend,afterWatchRecommendations} from '../public/recommendations.js';
import {itemKey} from '../public/home-model.js';
test('recomenda só gêneros declarados, exclui assistidos e respeita opt-out',()=>{
 const seed={name:'A',group:'Filmes',catalogGenreIds:['acao']},b={name:'B',group:'Filmes',catalogGenreIds:['acao']},c={name:'C',group:'Filmes',catalogGenreIds:['romance']};
 const index=recommendationIndex([seed,b,c]);
 assert.deepEqual(recommend(index,[seed]).map(x=>x.item),[b]);
 assert.equal(recommend(index,[seed])[0].reason,'A');
 assert.equal(recommend(index,[seed],{watched:new Set([itemKey(b)])}).length,0);
 assert.equal(recommend(index,[seed],{enabled:false}).length,0);
});

import {buildSeriesIndex} from '../public/cinema-series.js';
test('after watch excludes whole finished series and groups suggestions without changing sources',()=>{
 const entry=(id,name)=>({id,name,group:'Séries',catalogGenreIds:['drama'],url:'https://example.test/'+id});
 const a=entry('a','Alpha S01E01'),b=entry('b','Alpha S01E02'),c=entry('c','Beta S01E01'),d=entry('d','Beta S01E02');
 const items=[a,b,c,d],before=JSON.stringify(items),index=recommendationIndex(items),series=buildSeriesIndex(items);
 const rows=afterWatchRecommendations(index,b,series);
 assert.equal(rows.length,1);assert.equal(rows[0].title,'Beta');assert.equal(rows[0].item,c);
 assert.equal(afterWatchRecommendations(index,b,series,{enabled:false}).length,0);
 assert.equal(afterWatchRecommendations(index,b,series,{watched:new Set([itemKey(c),itemKey(d)])}).length,0);
 assert.equal(JSON.stringify(items),before);
});
