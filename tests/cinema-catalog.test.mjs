import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { buildShowcase, DEFAULT_SETTINGS } from '../public/home-model.js';
import {browseRoleFromHash, browsePageData, browseGroups, CATALOG_PAGE_SIZE} from '../public/cinema-browse.js';
const read = p => readFileSync(new URL('../public/'+p,import.meta.url),'utf8');

test('Navegação é por páginas reais e suporta back/forward do navegador', () => {
  assert.equal(browseRoleFromHash('#destaques-tv'),'tv');
  assert.equal(browseRoleFromHash('#destaques-filmes'),'movies');
  assert.equal(browseRoleFromHash('#destaques-series'),'series');
  assert.equal(browseRoleFromHash('#minha-lista'),'favorites');
  assert.equal(browseRoleFromHash('#inicio'),null);
  const home=read('home.js');
  assert.ok(home.includes('history.pushState('));
  assert.ok(home.includes("window.addEventListener('popstate'"));
  assert.ok(home.includes("browseRoot.hidden = !valid"));
  assert.ok(home.includes("if (browseRole) activateBrowse(null, { push: true, scroll: false })"));
});

test('Catálogo inteiro continua indexado em uma passagem e não perde contagem', () => {
  const examples=[];
  for(let i=0;i<12000;i++)examples.push({
    id:'c'+i,name:'Título '+i,
    group:i%3===0?'Canais':i%3===1?'Filmes':'Séries',
    url:'https://example.org/'+i+'.m3u8'
  });
  const result=buildShowcase(examples,DEFAULT_SETTINGS);
  assert.equal(Object.values(result.catalogs).flat().length,12000);
  for(const role of ['tv','movies','series']){
    assert.equal(result.catalogs[role].length,result.counts[role]);
    assert.ok(result.rails[role].length<=16);
  }
});

test('Paginação limita a criação de cards a 48 por página',()=>{
  const items=Array.from({length:38903},(_,i)=>({name:'Filme '+i,group:i%2?'Filmes BR':'Filmes UHD'}));
  const first=browsePageData(items);
  const end=browsePageData(items,{page:999999});
  assert.equal(CATALOG_PAGE_SIZE,48);
  assert.equal(first.total,38903);
  assert.equal(first.entries.length,48);
  assert.equal(first.pageCount,811);
  assert.equal(end.page,811);
  assert.equal(end.entries.length,23);
  const filtered=browsePageData(items,{query:'Filme 123',group:'Filmes BR'});
  assert.ok(filtered.entries.every(x=>x.name.includes('123')&&x.group==='Filmes BR'));
  assert.ok(filtered.entries.length<=48);
  assert.equal(browsePageData(items,{page:'not-a-number'}).page,1);
});

test('Grupos e buscas preservam textos arbitrários sem injetar HTML',()=>{
  const groups=browseGroups([{group:'Filmes'}, {group:'Filmes'}, {group:'TV'}, {group:'<script>alert(1)</script>'}]);
  assert.deepEqual(groups[0],['Filmes',2]);
  assert.ok(groups.some(([name])=>name==='<script>alert(1)</script>'));
  const home=read('home.js');
  assert.ok(home.includes('option.textContent = group'));
  assert.ok(home.includes('appendText(visual,'));
  assert.ok(home.includes('browseGrid.replaceChildren(fragment)'));
});

test('Ambas as versões Cinema exibem telas separadas sem tocar no player legado',()=>{
  for(const path of ['cinema.html','cinema/index.html']){
    const html=read(path);
    for(const id of ['cinema-browse','browse-title','browse-grid','browse-group','browse-page-label','browse-page-input','browse-page-go']){
      assert.ok(html.includes('id="'+id+'"'),path+' missing '+id);
    }
    assert.ok(html.includes('href="/cinema-browse.css"'));
  }
  const original=read('player.html');
  assert.ok(!original.includes('cinema-browse.css'));
  assert.ok(!original.includes('id="cinema-browse"'));
  const sw=read('cinema/sw.js');
  assert.ok(sw.includes("const VERSION = 'lux-cinema-shell-14'"));
  assert.ok(sw.includes("'/cinema-browse.css'"));
  assert.ok(sw.includes("'/cinema-browse.js'"));
  assert.ok(!sw.includes("'/api/bridge/playlist'"));
});

test('filtros combinados e ordenação não alteram itens, fontes ou catálogo original',()=>{
 const source=[{name:'Zeta',catalogYear:2024,catalogGenreIds:['acao'],catalogTags:['Dublado'],url:'https://example.org/a'},
 {name:'Álfa',catalogYear:2022,catalogGenreIds:['drama'],catalogTags:['Legendado']},
 {name:'Alfa 2',catalogYear:2024,catalogGenreIds:['acao'],catalogTags:['Dublado']},{name:'Sem ano'}];
 const original=structuredClone(source);
 assert.deepEqual(browsePageData(source,{sort:'title'}).entries.map(x=>x.name),['Álfa','Alfa 2','Sem ano','Zeta']);
 assert.deepEqual(browsePageData(source,{year:2024,genre:'acao',language:'Dublado',sort:'title'}).entries.map(x=>x.name),['Alfa 2','Zeta']);
 assert.equal(browsePageData(source,{query:'Alfa',year:2024,genre:'drama'}).total,0);
 assert.equal(browsePageData(source,{sort:'year'}).entries.at(-1).name,'Sem ano');
 assert.deepEqual(source,original);assert.equal(browsePageData(source).entries[0],source[0]);
 source.push({name:'Novo'});assert.equal(browsePageData(source).total,5);
});
