import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('splash revela a interface em 2,5 segundos sem aguardar o restore',()=>{
 const source=readFileSync(new URL('../public/cinema-app.js',import.meta.url),'utf8');
 const min=Number(/const MIN_BOOT_MS = (\d+)/.exec(source)[1]);assert.equal(min,2500);
 const code=source.slice(source.indexOf('function finishBoot()'),source.indexOf("bootSkip?.addEventListener"));
 let clock=0,left=false;const timers=[];
 const context=vm.createContext({MIN_BOOT_MS:min,bootStartedAt:0,bootFinished:false,bootFinishTimer:null,slowBootTimer:1,bootPhraseTimer:2,performance:{now:()=>clock},setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length},clearTimeout(){},clearInterval(){},bootSplash:{classList:{add:()=>left=true}}});
 vm.runInContext(code,context);assert.equal(left,false);assert.equal(timers[0].delay,2500);
 clock=2499;timers[0].fn();assert.equal(left,false);
 clock=2500;timers[1].fn();assert.equal(left,true);assert.equal(context.bootFinished,true);
});

test('perfil ponte e origem iniciam juntos e a vitrine usa o perfil antes da biblioteca',async()=>{
 const source=readFileSync(new URL('../public/cinema-app.js',import.meta.url),'utf8');const start=source.indexOf('async function initializeCinema(){'),code=source.slice(start,source.indexOf('void initializeCinema();',start));
 const calls=[],pending={};const deferred=name=>new Promise(resolve=>{pending[name]=resolve});const bridge=deferred('bridge'),profile=deferred('profile'),origin=deferred('origin');let finished=false;
 const response={ok:true};
 const context=vm.createContext({console,Response,home:null,showBootPhrase(){},isGuestMode:()=>false,fetch:()=>{calls.push('source');return origin},refreshBridgeStatus:()=>{calls.push('bridge');return bridge},prepareHomeProfile:()=>{calls.push('profile');return profile},createHome:()=>{calls.push('home');return {}},loadAccountSource:async value=>{assert.equal(value,response);calls.push('catalog');return true},restoreSavedLibrary:()=>{throw Error('Não deve restaurar duas fontes')},bootProgress(){},finishLibraryLoading(){},finishBoot:()=>{finished=true}});
 vm.runInContext(code,context);const work=context.initializeCinema();assert.deepEqual(calls,['source','bridge','profile']);assert.equal(finished,false);pending.profile();pending.bridge();pending.origin(response);await work;assert.deepEqual(calls,['source','bridge','profile','home','catalog']);assert.equal(finished,true);
});
