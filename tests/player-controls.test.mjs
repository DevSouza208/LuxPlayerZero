import test from 'node:test';
import assert from 'node:assert/strict';
import {formatPlayerTime,seekPlayer} from '../public/player-controls.js';
test('tempo de reprodução inclui horas e trata duração desconhecida',()=>{
 assert.equal(formatPlayerTime(9),'0:09');assert.equal(formatPlayerTime(9382),'2:36:22');assert.equal(formatPlayerTime(Infinity),'0:00');assert.equal(formatPlayerTime(NaN),'0:00');
});
test('busca limita saltos às bordas e preserva live sem duração',()=>{
 const vod={duration:120,currentTime:30};assert.equal(seekPlayer(vod,-10),true);assert.equal(vod.currentTime,0);seekPlayer(vod,200);assert.equal(vod.currentTime,120);
 const live={duration:Infinity,currentTime:50};assert.equal(seekPlayer(live,80),false);assert.equal(live.currentTime,50);
});

test('clique do botão de tela cheia chama API na raiz e permite sair',async()=>{
 const {togglePlayerFullscreen}=await import('../public/player-controls.js');
 const {readFileSync}=await import('node:fs');const vm=await import('node:vm');
 const source=readFileSync(new URL('../public/player-controls.js',import.meta.url),'utf8');
 const binding=source.match(/fullscreen\.addEventListener\('click',toggleFullscreen\);/);assert.ok(binding);
 let clicked,entered=0,exited=0;const root={requestFullscreen(){assert.equal(this,root);entered++}};
 const doc={documentElement:root,fullscreenEnabled:true,exitFullscreen(){exited++}};
 vm.runInNewContext(binding[0],{fullscreen:{addEventListener(type,fn){assert.equal(type,'click');clicked=fn}},toggleFullscreen:()=>togglePlayerFullscreen({},doc)});
 await clicked();assert.equal(entered,1);doc.fullscreenElement=root;await clicked();assert.equal(exited,1);
});
test('tela cheia usa WebKit e vídeo nativo no iOS quando necessário',async()=>{
 const {togglePlayerFullscreen}=await import('../public/player-controls.js');let entered=0;
 await togglePlayerFullscreen({}, {documentElement:{webkitRequestFullscreen(){entered++}}});
 await togglePlayerFullscreen({webkitEnterFullscreen(){entered++}}, {documentElement:{},fullscreenEnabled:false});
 assert.equal(entered,2);await assert.rejects(togglePlayerFullscreen({}, {documentElement:{}}),/indisponível/);
});
