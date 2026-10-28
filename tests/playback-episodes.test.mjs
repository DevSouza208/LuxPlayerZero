import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {buildSeriesIndex} from '../public/cinema-series.js';
const source=readFileSync(new URL('../public/home.js',import.meta.url),'utf8');
const methods=source.slice(source.indexOf('    playbackEpisodes(){'),source.indexOf('    onSelect(item) {'));
test('menu lista apenas episódios da série ativa e rejeita escolha fora dela',()=>{
 const current={id:'c1'},next={id:'c2'},group={title:'Série',episodes:[{item:current,season:1,number:1},{item:next,season:1,number:2}]};let selected;
 const context=vm.createContext({active:current,seriesIndex:{byItemId:new Map([['c1',group]])},start:item=>{selected=item}});
 const api=vm.runInContext('({'+methods+'})',context);
 assert.equal(api.playbackEpisodes().entries.length,2);assert.equal(api.playbackEpisodes().current,'c1');
 api.playEpisode('c3');assert.equal(selected,undefined);api.playEpisode('c2');assert.equal(selected,next);
});
test('filmes e TV não oferecem menu de episódios',()=>{
 const api=vm.runInNewContext('({'+methods+'})',{active:{id:'c9'},seriesIndex:{byItemId:new Map()},start(){throw Error('Não deve reproduzir')}});
 assert.equal(api.playbackEpisodes(),null);api.playEpisode('c1');
});
test('fonte alternativa ativa destaca um único episódio no menu sem repetir as versões',()=>{
 const entries=[{id:'primary',name:'Série S1E1',url:'https://example.com/a'},{id:'alternate',name:'Série S1E1',url:'https://example.com/b'},{id:'next',name:'Série S1E2',url:'https://example.com/c'}];let selected;
 const api=vm.runInNewContext('({'+methods+'})',{active:entries[1],seriesIndex:buildSeriesIndex(entries),start:item=>{selected=item}});
 const menu=api.playbackEpisodes();assert.equal(menu.entries.length,2);assert.equal(menu.current,'primary');
 api.playEpisode('next');assert.equal(selected,entries[2]);api.playEpisode('alternate');assert.equal(selected,entries[1]);
});
