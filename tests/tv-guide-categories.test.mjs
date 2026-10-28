import test from 'node:test';
import assert from 'node:assert/strict';
import {guideCategoryForChannel,guideTvGroups,TV_GUIDE_CATEGORIES} from '../public/tv-guide-categories.js';
import {groupTvEntries} from '../public/cinema-tv-groups.js';
test('divisão do MeuGuia conserva categorias e exceções editoriais',()=>{
 assert.deepEqual(TV_GUIDE_CATEGORIES.map(([,label])=>label),['Filmes','Séries','Esportes','Infantil','Variedades','Documentários','Notícias','TV aberta','Outros']);
 for(const [name,expected] of [['HBO 2 FHD','movies'],['TNT','movies'],['TNT Séries','series'],['Animal Planet','series'],['Discovery HD Theater','series'],['Discovery Home & Health','documentary'],['Discovery Kids','kids'],['Multishow','variety'],['Globo News','news'],['Record News','open'],['Band Sports','sports'],['Band News','news']])assert.equal(guideCategoryForChannel(name),expected,name);
});
test('normalização ignora qualidade e reconhece afiliadas explícitas sem inventar rede',()=>{
 for(const name of ['BR: Globo Sudeste FHD HEVC','Globo Sul HD','SBT São Paulo','Record TV Rio HD','Band São Paulo'])assert.equal(guideCategoryForChannel(name),'open',name);
 assert.equal(guideCategoryForChannel('Premiere 7 HD'),'sports');
 for(const name of ['Canal São Paulo','Novidades do fornecedor','Globoplay Novelas','Canal sem categoria'])assert.equal(guideCategoryForChannel(name),'other',name);
});
test('classifica grupos lógicos uma vez e preserva todas as fontes originais',()=>{
 const values=[['a','SporTV HD','sportv.br'],['b','SporTV SD','sportv.br'],['c','Globo Sul HD','globo.br'],['d','US: ESPN','espn.us'],['e','Canal sem categoria','other.br'],['f','Canal estrangeiro','other.foreign','CANAIS INTERNACIONAIS']].map(([id,name,epgId,group])=>({id,name,epgId,group:group||'CANAIS COMPLETO',url:'https://example.com/live/test/'+id+'.m3u8'}));
 const before=structuredClone(values),source=groupTvEntries(values),index=guideTvGroups(source.groups);
 assert.deepEqual(index.categories.map(row=>row.label),['Esportes','TV aberta','Outros']);
 assert.equal(index.channels.length,3);assert.equal(index.categories.reduce((n,row)=>n+row.channels.length,0),3);
 assert.equal(index.groups[0].variants.length,2);assert.equal(index.categories[0].channels[0],values[0]);assert.deepEqual(values,before);
 assert.deepEqual(guideTvGroups([]),{groups:[],channels:[],categories:[]});
});
