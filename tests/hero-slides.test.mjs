import test from 'node:test';
import assert from 'node:assert/strict';
import {createHeroSlideState} from '../public/hero-slides-model.js';
const rows=()=>Array.from({length:14},(_,id)=>({id:String(id),url:'https://source.test/'+id}));
test('ciclo avança e volta pelos 14 objetos originais, sem alterar URLs',()=>{
 const items=rows(),state=createHeroSlideState();assert.equal(state.setItems(items),items[0]);
 assert.equal(state.move(-1),items[13]);assert.equal(state.move(1),items[0]);
 for(let i=1;i<14;i++)assert.equal(state.move(1),items[i]);
 assert.equal(state.move(1),items[0]);assert.equal(items[0].url,'https://source.test/0');
});
test('re-render preserva o slide selecionado e reordenação acompanha identidade',()=>{
 const items=rows(),state=createHeroSlideState({seed:.5});assert.equal(state.setItems(items),items[7]);
 state.move(1);assert.equal(state.setItems([...items]),items[8]);assert.equal(state.setItems([...items].reverse()),items[8]);assert.equal(state.index,5);
});
test('seleção nova remove título ausente, duplicatas e conserva os objetos disponíveis',()=>{
 const items=rows(),state=createHeroSlideState();state.setItems(items);state.move(1);
 assert.equal(state.setItems([items[4],items[4],items[5]]),items[4]);assert.equal(state.length,2);
 assert.equal(state.move(-1),items[5]);
});
test('sem títulos não há slide e destaque fixado permanece sozinho',()=>{
 const state=createHeroSlideState();assert.equal(state.setItems([]),null);assert.equal(state.move(1),null);
 const pinned={id:'pinned'};assert.equal(state.setItems([pinned]),pinned);assert.equal(state.move(1),pinned);assert.equal(state.move(-1),pinned);assert.equal(state.length,1);
});
