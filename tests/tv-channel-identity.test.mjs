import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalTvName} from '../public/tv-normalizer.js';
import {groupTvEntries,tvLogicalIdentity} from '../public/cinema-tv-groups.js';
import {parseTvCuratedCatalog,curatedTvGroups} from '../public/tv-curated-catalog.js';
import {readFileSync} from 'node:fs';

const entry=(id,name,epgId='')=>({id,name,epgId,group:'CANAIS COMPLETO',url:'https://example.org/live/test/'+id+'.m3u8'});
const fixture=JSON.parse(readFileSync(new URL('../public/data/tv-channel-groups.json',import.meta.url),'utf8'));

test('sufixos de qualidade codec e duplicatas nao alteram a identidade do canal',()=>{
 const variants=[
  'Premiere Clubes FHD ²','Premiere Clubes SD','Premiere Clubes FHD [H265]',
  'Premiere Clubes 4K','Premiere Clubes HD ² [H265]','Premiere Clubes 1 HD'
 ];
 for(const name of variants)assert.equal(tvLogicalIdentity(name).identity,'premiere clubes 1',name);
 assert.equal(canonicalTvName('Premiere 6 SD ²'),'Premiere 6');
 assert.equal(canonicalTvName('BR: Premiere 2 FHD [H265]'),'Premiere 2');
 assert.equal(canonicalTvName('SporTV FHD H265'),'SporTV');
 assert.equal(canonicalTvName('Discovery HD Theater'),'Discovery HD Theater');
 assert.equal(canonicalTvName('ESPN 4K'),'ESPN');
 assert.equal(canonicalTvName('ESPN 4 4K'),'ESPN 4');
});

test('ausencia do numero significa um e nao une canais de numeracao ou familia diferente',()=>{
 const names=['Premiere Clubes 4K','Premiere Clubes SD','Premiere Clubes 1 HD',
   'Premiere 2 FHD','Premiere 2 SD ²','Premiere 3 HD','ESPN FHD','ESPN 1 HD',
   'ESPN 2 SD','ESPN Premium HD','HBO Family HD','HBO 2 HD',
   'SporTV 4K','SporTV 1 SD','SporTV 2 SD'];
 const values=names.map((name,i)=>entry(String(i),name));
 const before=structuredClone(values),index=groupTvEntries(values);
 assert.equal(index.groups.length,10);
 const variants=name=>index.byItemId.get(values[names.indexOf(name)].id).variants;
 assert.equal(variants('Premiere Clubes 4K').length,3);
 assert.equal(variants('Premiere 2 FHD').length,2);
 assert.equal(variants('ESPN FHD').length,2);
 assert.equal(variants('SporTV 4K').length,2);
 assert.notEqual(index.byItemId.get('3'),index.byItemId.get('5'));
 assert.notEqual(index.byItemId.get('6'),index.byItemId.get('8'));
 assert.notEqual(index.byItemId.get('6'),index.byItemId.get('9'));
 assert.notEqual(index.byItemId.get('10'),index.byItemId.get('11'));
 assert.equal(index.sourceCount,15);
 assert.deepEqual(values,before,'Nao modificar as entradas/URLs originais');
});

test('qualidades iguais continuam selecionaveis como fontes individuais',()=>{
 const rows=[entry('a','Premiere 6 FHD'),entry('b','Premiere 6 FHD ²'),
   entry('c','Premiere 6 FHD [H265]'),entry('d','Premiere 6 SD ²')];
 const index=groupTvEntries(rows);
 assert.equal(index.groups.length,1);
 assert.equal(index.groups[0].variantCount,4);
 assert.deepEqual(index.groups[0].variants.map(row=>row.item.id),['a','b','c','d']);
 assert.deepEqual(index.groups[0].variants.map(row=>row.label),
  ['Full HD','Full HD · fonte 2','Full HD · fonte 3','SD']);
 assert.equal(new Set(index.groups[0].variants.map(row=>row.item.url)).size,4);
});

test('EPG divergente nao divide mesmo canal e EPG repetido nao junta numeros diferentes',()=>{
 const values=[entry('a','Premiere 6 HD','premiere.6'),
  entry('b','Premiere 6 FHD','premiere6.diferente'),
  entry('c','Premiere 7 SD','premiere.6'),
  entry('d','Premiere 7 FHD','premiere.7'),
  entry('e','Canal X','mesmo.epg'),
  entry('f','Canal Y','mesmo.epg')];
 const index=groupTvEntries(values);
 assert.equal(index.groups.length,3);
 assert.equal(index.byItemId.get('a'),index.byItemId.get('b'));
 assert.equal(index.byItemId.get('c'),index.byItemId.get('d'));
 assert.notEqual(index.byItemId.get('a'),index.byItemId.get('c'));
 assert.equal(index.byItemId.get('e'),index.byItemId.get('f'));
 assert.equal(index.groups.reduce((count,row)=>count+row.variants.length,0),values.length);
});

test('catalogo editorial mostra um card por Premiere mesmo com varias fontes',()=>{
 const data=fixture.canais.filter(row=>row.grupo==='Esportes'&&row.subgrupo==='Premiere'&&
  /^(?:Premiere Clubes|Premiere 2)\s/i.test(row.nome));
 assert.ok(data.length>=10,'Fixture deve ter varias fontes de cada canal');
 const values=data.map((row,i)=>entry('source-'+i,row.nome));
 // URLs de teste devem usar os IDs editoriais para aplicar o mapa real.
 values.forEach((item,i)=>{item.url='https://example.org/live/test/'+data[i].id+'.m3u8'});
 const grouped=groupTvEntries(values);
 const index=curatedTvGroups(grouped.groups,parseTvCuratedCatalog(fixture));
 const sports=index.categories.find(row=>row.label==='Esportes');
 const premiere=sports.subgroups.find(row=>row.label==='Premiere');
 assert.equal(premiere.channels.length,2,'Premiere Clubes e Premiere 2 devem ser apenas dois cards');
 assert.equal(index.groups.length,2);
 assert.equal(index.groups.reduce((count,row)=>count+row.variants.length,0),values.length);
 assert.equal(index.groups.length<values.length,true);
});
