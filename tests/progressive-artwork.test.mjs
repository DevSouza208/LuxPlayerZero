import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/home.js',import.meta.url),'utf8');
test('chegada da capa preserva o card e atualiza somente a imagem em um frame',()=>{
 const code=source.slice(source.indexOf('  function scheduleArtworkRender('),source.indexOf('  function pumpTmdbQueue('));
 const item={id:'c1'};let frame,removed=false,src='old';
 const img={getAttribute:()=>src,set src(value){src=value}};
 const visual={classList:{remove(){removed=true}},querySelector:()=>img};
 const context=vm.createContext({changedArtwork:new Set(),artworkRenderFrame:null,requestAnimationFrame:fn=>{frame=fn;return 1},artworkFor:()=> 'new',document:{querySelectorAll:()=>[visual]},heroItem:null,browseRole:'movies'});
 vm.runInContext(code,context);context.scheduleArtworkRender(item);context.scheduleArtworkRender(item);
 assert.equal(context.changedArtwork.size,1);assert.equal(src,'old');frame();
 assert.equal(src,'new');assert.equal(removed,true);assert.equal(context.changedArtwork.size,0);
});
test('transição termina em um segundo mesmo sem qualquer imagem responder',()=>{
 const start=source.indexOf('  function animateSection('),end=source.indexOf('  function activateBrowse(',start);
 let finish;const overlay={hidden:true,classList:{remove(){},add(){}}};
 const context=vm.createContext({sectionTransitionTimer:null,sectionMinimumDone:true,sectionTransition:overlay,clearTimeout(){},requestAnimationFrame:fn=>fn(),setTimeout:(fn,ms)=>{assert.equal(ms,1000);finish=fn},finishSectionTransition:()=>{overlay.hidden=true}});
 vm.runInContext(source.slice(start,end)+"animateSection('movies');",context);
 assert.equal(overlay.hidden,false);finish();assert.equal(overlay.hidden,true);
});
