import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyCatalogItem,buildCatalogRails,FALLBACK_RAIL} from '../src/catalog-rails.js';
test('sem metadados vai para Novidade no Lux sem alterar item',()=>{
 const item={titulo:'Filme sem dados',url:'http://example.test/video?token=secret'};
 assert.deepEqual(classifyCatalogItem(item).rails,[FALLBACK_RAIL]);
 assert.equal(item.url,'http://example.test/video?token=secret');
});
test('ano de origem classifica antes da referência',()=>{
 assert.deepEqual(classifyCatalogItem({titulo:'Filme (2026)'},{nowYear:2026}).rails,['Lançamentos de 2026']);
});
test('gêneros de origem organizam múltiplas fileiras',()=>{
 assert.deepEqual(classifyCatalogItem({generos:['Action','Drama']}).rails,['Ação','Drama']);
});
test('referência não verificada não classifica',()=>{
 assert.deepEqual(classifyCatalogItem({titulo:'Novo'},{referenceMatch:{verified:false,generos:['Drama']}}).rails,[FALLBACK_RAIL]);
});
test('referência verificada enriquece sem excluir exclusivos',()=>{
 const items=[{id:'exclusivo',titulo:'Novo'},{id:'outro',titulo:'Outro'}];
 const rails=buildCatalogRails(items,{resolveVerifiedReference:i=>i.id==='exclusivo'?{verified:true,generos:['Drama']}:null});
 assert.equal(rails.get('Drama')[0],items[0]);
 assert.equal(rails.get(FALLBACK_RAIL)[0],items[1]);
 assert.equal(items.length,2);
});
