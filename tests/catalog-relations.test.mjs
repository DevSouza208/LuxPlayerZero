import test from 'node:test';
import assert from 'node:assert/strict';
import {relationIndex,resolveRelations} from '../public/catalog-relations.js';
test('relations require catalog presence and exact title/year or explicit ID',()=>{
 const a={name:'Aventura (2024)',url:'http://example.test/original'},b={name:'Nome local',tmdbId:22},c={name:'Sem ano'};
 const items=[a,b,c],before=JSON.stringify(items),index=relationIndex(items);
 assert.deepEqual(resolveRelations(index,[{id:11,title:'Aventura',year:'2024'},{id:22,title:'Outro título',year:'2000'},{id:33,title:'Sem ano'},{id:44,title:'Ausente',year:'2024'}]).map(row=>row.item),[a,b]);
 assert.equal(resolveRelations(index,[{id:11,title:'Aventura',year:'2023'}]).length,0);
 assert.equal(resolveRelations(index,[{id:11,title:'Aventuras',year:'2024'}]).length,0);
 assert.equal(resolveRelations(index,[{id:11,title:'Aventura',year:'2024'}],{excludeId:11}).length,0);
 assert.equal(JSON.stringify(items),before);
});
test('relations avoid conflicting IDs, deduplicate metadata and preserve variants in source',()=>{
 const items=[{name:'Aventura (2024)',tmdbId:12},{name:'Aventura (2024)'},{name:'Outra (2025)'},{name:'Outra (2025)',url:'alternate'}];
 const index=relationIndex(items);
 assert.equal(resolveRelations(index,[{id:11,title:'Aventura',year:'2024'}]).length,0);
 assert.equal(resolveRelations(index,[{id:20,title:'Outra',year:'2025'},{id:20,title:'Outra',year:'2025'}]).length,1);
 assert.equal(items.length,4);
});
