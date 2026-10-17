import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deriveCatalogPresentation, presentationForEntry, titleForDisplay } from '../public/cinema-title.js';
import { tmdbQueryForItem } from '../public/tmdb-client.js';
import { itemKey } from '../public/home-model.js';
const file = p => readFileSync(new URL('../public/' + p, import.meta.url),'utf8');

test('Replica marcadores do Lux 2.0, preserva ano para TMDB e exibe nome limpo', () => {
  const cases = [
    ['+ A Odisseia (2026)','A Odisseia',2026],
    ['- - Duna (2021) - 4K','Duna',2021],
    ['— — Oppenheimer [2023]','Oppenheimer',2023],
    ['O Senhor dos Anéis {2001}','O Senhor dos Anéis',2001],
    ['FHD - Blade Runner 2049','Blade Runner 2049',null],
    ['O Bebê Maldito (2024) [HD]','O Bebê Maldito',2024],
    ['Duna [DUB] (2021)','Duna',2021],
    ['Série [LEGENDADO] (2025)','Série',2025],
    ['Cinema (2026) 4K','Cinema (2026) 4K',null],
    ['Blade Runner 2049','Blade Runner 2049',null],
    ['Ford v Ferrari','Ford v Ferrari',null],
    ['C++','C++',null],
    ['A+','A+',null]
  ];
  for(const [original, expectedTitle, expectedYear] of cases){
    const result=deriveCatalogPresentation(original);
    assert.deepEqual([result.title,result.year],[expectedTitle,expectedYear],original);
  }
});

test('Data de atualização não vira ano de lançamento; marcações viram tags', ()=>{
  const data=deriveCatalogPresentation('+ A Odisseia [LEG] [DUB] 17/10/2026');
  assert.equal(data.title,'A Odisseia');
  assert.equal(data.year,null);
  assert.deepEqual(data.tags,['Dublado','Legendado']);
  assert.equal(deriveCatalogPresentation('Série 2 [CINEMA]').tags[0],'Cinema');
});

test('Consulta TMDB usa ano extraído, não URL, e respeita conteúdo não audiovisual',()=>{
  const origin={
    id:'m3u-1', name:'+ A Odisseia (2026)',group:'FILMES',
    url:'http://private.example/movie/user/password/321.mp4',kind:'tv'
  };
  const item={...origin,...presentationForEntry(origin)};
  assert.equal(origin.name,'+ A Odisseia (2026)');
  assert.equal(origin.url,item.url);
  assert.equal(titleForDisplay(item),'A Odisseia');
  assert.deepEqual(tmdbQueryForItem(item,'movies'),{type:'movie',title:'A Odisseia',year:2026});
  assert.equal(tmdbQueryForItem(item,'tv'),null);
  assert.equal(tmdbQueryForItem({...item,group:'Curso de inglês'},'movies'),null);
});

test('Identidade do item, URL e contagem nunca mudam por normalização', () => {
  const entries=[
    {name:'- - Título A [DUB] (2022)',group:'Filmes',url:'https://private/a'},
    {name:'+ Título B (2024)',group:'Séries',url:'https://private/b'},
    {name:'Aula 01',group:'Cursos',url:'https://private/c'}
  ];
  const after=entries.map(item=>({...item,...presentationForEntry(item)}));
  assert.equal(after.length,entries.length);
  for(let i=0;i<entries.length;i++){
    assert.equal(after[i].name,entries[i].name);
    assert.equal(after[i].group,entries[i].group);
    assert.equal(after[i].url,entries[i].url);
    assert.equal(itemKey(after[i]),itemKey(entries[i]));
  }
});

test('Limpeza acontece no carregamento e não por card ou parse bruto', ()=>{
  const app=file('cinema-app.js'), home=file('home.js');
  assert.ok(app.includes("...presentationForEntry(item)"));
  assert.ok(!file('player.html').includes('cinema-title.js'));
  assert.ok(!file('app.js').includes('cinema-title.js'));
  assert.ok(home.includes("titleForDisplay(item)"));
  assert.ok(home.includes("titleForDisplay(heroItem)"));
  assert.ok(file('cinema-browse.js').includes("item.displayName || item.name"));
});
test('Limpeza de 260 mil títulos não exige materializar segundo catálogo',()=>{
  // Representativo e leve; cada entrada recebe só campos derivados opcionais.
  const entries=Array.from({length:260000},(_,i)=>({name:i%2?'+ Odisseia (2026)':'Canal Globo',group:i%2?'Filmes':'Canais',url:'https://invalid.example/'+i}));
  let count=0;
  for(const entry of entries){
    Object.assign(entry,presentationForEntry(entry));
    count++;
  }
  assert.equal(count,260000);
  assert.equal(entries[1].displayName,'Odisseia');
  assert.equal(entries[1].catalogYear,2026);
  assert.equal(entries[0].displayName,undefined);
});
