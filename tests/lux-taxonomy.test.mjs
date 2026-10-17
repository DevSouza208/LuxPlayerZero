import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyMediaCategories,normalizeMediaGroup,mediaQuality,searchSimilarity} from '../public/media-taxonomy.js';
import {tagColor,TAG_PALETTE} from '../public/lux-tag-palette.js';
import {canonicalTvName} from '../public/tv-normalizer.js';
import {presentationForEntry} from '../public/cinema-title.js';

test('taxonomia Lux 2.0: aliases de gênero, plataforma e coleção',()=>{
 const found=classifyMediaCategories(["❖ Netflix' | 2 Drama",'❖ Prime Video','Animes'],['Ação & Aventura']);
 assert.deepEqual(found.platformIds,['netflix','prime']);
 assert.deepEqual(found.genreIds,['drama','acao','aventura']);
 assert.deepEqual(found.collectionIds,['animes']);
 assert.equal(normalizeMediaGroup('❖ 2 Drama'),'Drama');
 assert.deepEqual(classifyMediaCategories(['Outras Produtoras']).otherCollections,['Outras Produtoras']);
});
test('nomes e URLs M3U são preservados ao aplicar tags e nome de exibição',()=>{
 const source={name:'- - Duna [DUB] (2021) - 4K',group:'❖ Netflix',url:'http://source.example/movie/a',kind:'tv'};
 const item={...source,...presentationForEntry(source)};
 assert.equal(item.name,source.name);
 assert.equal(item.url,source.url);
 assert.equal(item.group,source.group);
 assert.equal(item.displayName,'Duna');
 assert.equal(item.catalogYear,2021);
 assert.ok(item.catalogTags.includes('Dublado'));
 assert.ok(item.catalogTags.includes('4K'));
 assert.ok(item.catalogTags.includes('Netflix'));
 assert.equal(mediaQuality('Canal Full HD'),'Full HD');
});
test('paleta de 256 cores e variantes de canais',()=>{
 assert.equal(TAG_PALETTE.length,256);
 assert.deepEqual(tagColor('Ação'),tagColor('Ação'));
 assert.notDeepEqual(tagColor('Ação'),tagColor('Drama'));
 assert.equal(canonicalTvName('SporTV 2 HD'),'SporTV 2');
 assert.equal(canonicalTvName('BR | Sport TV 1 FHD'),'SporTV');
 assert.ok(searchSimilarity('Duna: Parte Dois','Duna Parte 2')>.6);
});
