import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/home.js',import.meta.url),'utf8');
const start=source.indexOf('  function showDetails(item) {');
const body=source.slice(start,source.indexOf('  function showLiveDetails(item)',start));
for(const role of ['movies','series'])for(const metadata of [null,{status:'matched',backdrop:'https://example.com/backdrop.jpg'}]){
 test(`clique abre detalhes de ${role} ${metadata?'com':'sem'} metadados`,()=>{
  const item={id:'c1'},series={title:'Série',episodes:[]};let opened;
  const context=vm.createContext({classifyRole:()=>role,cachedMetadata:()=>metadata,seriesIndex:{byItemId:new Map([['c1',series]])},artworkFor:()=> 'poster',providerArtwork:()=> 'fallback',fullDetails:{open:(selected,options)=>{opened={selected,options}}}});
  vm.runInContext(body,context);context.showDetails(item);
  assert.equal(opened.selected,item);assert.equal(opened.options.backdrop,metadata?.backdrop||'');
  assert.equal(opened.options.series,role==='series'?series:null);
 });
}

test('TV usa exclusivamente o fluxo ao vivo',()=>{
 let liveItem;const item={id:'c2'};
 const context=vm.createContext({classifyRole:()=> 'tv',showLiveDetails:selected=>{liveItem=selected},fullDetails:{open(){throw Error('VOD não deve abrir para live')}}});
 vm.runInContext(body,context);context.showDetails(item);assert.equal(liveItem,item);
});
