import test from 'node:test';
import assert from 'node:assert/strict';
import {isGuestMode,createGuestStore} from '../public/guest-mode.js';
import {accountGate} from '../src/account-gate.js';
test('visitor shell works without bindings but does not unlock private paths',async()=>{
 assert.equal(isGuestMode('https://lux.test/cinema/?guest=1'),true);
 assert.equal(isGuestMode('https://lux.test/account/?guest=1'),false);
 assert.equal(await accountGate(new Request('https://lux.test/cinema/?guest=1'),{}),null);
 for(const path of ['/cinema/install.js','/cinema/sw.js','/cinema/manifest.webmanifest'])assert.equal(await accountGate(new Request('https://lux.test'+path),{}),null);
 for(const path of ['/account/?guest=1','/api/metadata/details?guest=1','/cinema/private?guest=1']){
  assert.notEqual(await accountGate(new Request('https://lux.test'+path),{}),null);
 }
});
test('visitor state stays in memory and never carries over to another instance',async()=>{
 const a=createGuestStore(),b=createGuestStore(),favorites=[{name:'Local'}];await a.write('favorites',favorites);favorites.push({name:'Other'});
 assert.equal(a.read('favorites',[]).length,1);assert.deepEqual(b.read('favorites',[]),[]);
 const copy=a.read('favorites',[]);copy.push({name:'Mutated'});assert.equal(a.read('favorites',[]).length,1);
});
