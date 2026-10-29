import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,statSync} from 'node:fs';import vm from 'node:vm';
import {TV_FOLDER_COVERS,tvFolderCover} from '../public/tv-folder-covers.js';
const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const catalog=JSON.parse(read('data/tv-channel-groups.json'));
const hidden=new Set(['Informações da lista','Outros','Rádios','Internacionais']);
test('todos os grupos e subgrupos visíveis têm capa local individual',()=>{
 const groups=catalog.grupos.filter(row=>!hidden.has(row.nome));assert.equal(groups.length,12);assert.equal(Object.keys(TV_FOLDER_COVERS.subgroups).length,91);
 const paths=[TV_FOLDER_COVERS.all];for(const group of groups){assert.ok(TV_FOLDER_COVERS.groups[group.nome]);paths.push(tvFolderCover(group.nome));for(const sub of group.subgrupos){const key=group.nome+'\u241f'+sub.nome;assert.ok(TV_FOLDER_COVERS.subgroups[key],key);paths.push(tvFolderCover(group.nome,sub.nome));}}
 assert.equal(paths.length,104);assert.equal(new Set(paths).size,104);
 let bytes=0;for(const path of paths){assert.match(path,/^\/assets\/tv-covers\/[a-z0-9-]+\.svg$/);const svg=read(path.slice(1));bytes+=Buffer.byteLength(svg);assert.match(svg,/<svg[^>]+viewBox="0 0 640 360"/);assert.match(svg,/<title[^>]*>.+<\/title>/);assert.doesNotMatch(svg,/<(?:script|foreignObject|image)\b|\bonload\s*=|\bhref\s*=/i);assert.equal(statSync(new URL('../public'+path,import.meta.url)).isFile(),true)}assert.ok(bytes<400000);
});
test('família desconhecida reutiliza capa segura sem buscar imagem externa',()=>{
 assert.equal(tvFolderCover('Esportes','Família nova'),TV_FOLDER_COVERS.groups.Esportes);assert.equal(tvFolderCover('<script>'),TV_FOLDER_COVERS.all);assert.equal(tvFolderCover(''),TV_FOLDER_COVERS.all);
});
test('cache de capas se limita a SVG público local sem query nem mídia privada',()=>{
 const sw=read('cinema/sw.js'),source=sw.match(/const isTvCover = [^\n]+/)[0];const context=vm.createContext({self:{location:{origin:'https://lux.example'}}});const check=vm.runInContext(source+'\nisTvCover',context);
 assert.equal(check(new URL('https://lux.example/assets/tv-covers/esportes.svg')),true);
 for(const url of ['https://other.example/assets/tv-covers/esportes.svg','https://lux.example/assets/tv-covers/esportes.svg?token=test','https://lux.example/live/test/test/channel.svg','https://lux.example/api/catalog','https://lux.example/assets/tv-covers/private.m3u8'])assert.equal(check(new URL(url)),false,url);
 assert.ok(!sw.includes("'/assets/tv-covers/esportes.svg',"),'não deve pré-carregar todas as capas na instalação');
});
