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
