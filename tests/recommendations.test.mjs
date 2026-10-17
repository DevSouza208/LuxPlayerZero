import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendationIndex,recommend} from '../public/recommendations.js';
import {itemKey} from '../public/home-model.js';
test('recomenda só gêneros declarados, exclui assistidos e respeita opt-out',()=>{
 const seed={name:'A',group:'Filmes',catalogGenreIds:['acao']},b={name:'B',group:'Filmes',catalogGenreIds:['acao']},c={name:'C',group:'Filmes',catalogGenreIds:['romance']};
 const index=recommendationIndex([seed,b,c]);
 assert.deepEqual(recommend(index,[seed]).map(x=>x.item),[b]);
 assert.equal(recommend(index,[seed])[0].reason,'A');
 assert.equal(recommend(index,[seed],{watched:new Set([itemKey(b)])}).length,0);
 assert.equal(recommend(index,[seed],{enabled:false}).length,0);
});
