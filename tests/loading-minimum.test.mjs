import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('splash aguarda mínimo de cinco segundos mesmo se conteúdo termina antes',()=>{
 const source=readFileSync(new URL('../public/cinema-app.js',import.meta.url),'utf8');
 const min=Number(/const MIN_BOOT_MS = (\d+)/.exec(source)[1]);assert.equal(min,5000);
 const code=source.slice(source.indexOf('function finishBoot()'),source.indexOf("bootSkip?.addEventListener"));
 let clock=0,left=false;const timers=[];
 const context=vm.createContext({MIN_BOOT_MS:min,bootStartedAt:0,bootFinished:false,bootFinishTimer:null,slowBootTimer:1,bootPhraseTimer:2,performance:{now:()=>clock},setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length},clearTimeout(){},clearInterval(){},bootSplash:{classList:{add:()=>left=true}}});
 vm.runInContext(code+'finishBoot();',context);assert.equal(left,false);assert.equal(timers[0].delay,5000);
 clock=4999;timers[0].fn();assert.equal(left,false);
 clock=5000;timers[1].fn();assert.equal(left,true);assert.equal(context.bootFinished,true);
});
