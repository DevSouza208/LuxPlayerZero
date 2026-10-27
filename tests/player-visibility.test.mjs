import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayerVisibility} from '../public/player-visibility.js';

function setup(){
 let playing=true,blocked=false,pending=null;const changes=[];
 const controls=createPlayerVisibility({isPlaying:()=>playing,isBlocked:()=>blocked,onChange:value=>changes.push(value),setTimer:fn=>{pending=fn;return 1},clearTimer:()=>{pending=null}});
 return {controls,changes,playing:value=>playing=value,blocked:value=>blocked=value,expire(){const fn=pending;pending=null;fn?.()},pending:()=>pending};
}
test('controls fade during playback and return when the user interacts',()=>{
 const x=setup();x.controls.reveal();assert.equal(x.controls.idle,false);x.expire();assert.equal(x.controls.idle,true);
 x.controls.reveal();assert.equal(x.controls.idle,false);assert.ok(x.pending());
});
test('a fresh interaction restarts the idle deadline',()=>{
 const x=setup();x.controls.reveal();const old=x.pending();x.controls.reveal();assert.notEqual(x.pending(),old);x.expire();assert.equal(x.controls.idle,true);
});
test('pause and end states keep controls visible and cancel pending timers',()=>{
 const x=setup();x.controls.reveal();x.playing(false);x.controls.reveal();assert.equal(x.pending(),null);assert.equal(x.controls.idle,false);
});
test('an open menu, range drag or keyboard focus prevents hiding',()=>{
 const x=setup();x.controls.reveal();x.blocked(true);x.expire();assert.equal(x.controls.idle,false);
 x.blocked(false);x.controls.reveal();x.expire();assert.equal(x.controls.idle,true);
});
test('closing the player cancels timers and resets the next session',()=>{
 const x=setup();x.controls.reveal();x.controls.stop();assert.equal(x.pending(),null);assert.equal(x.controls.idle,false);
 x.controls.reveal();x.expire();assert.equal(x.controls.idle,true);
});
