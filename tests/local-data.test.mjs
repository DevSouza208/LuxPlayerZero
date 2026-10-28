import test from 'node:test';import assert from 'node:assert/strict';import {createLocalData} from '../public/local-data.js';
function fakeIndexedDB(){
 const rows=new Map();let last,opens=0,closed=0,fail=false;
 const api={open(){opens++;const request={};queueMicrotask(()=>{
  request.result={close(){closed++},transaction(_name,mode){
   let staged,aborted=false;const tx={abort(){aborted=true;tx.onabort?.()},objectStore(){return {
    get(key){const req={};queueMicrotask(()=>{req.result=structuredClone(rows.get(key));req.onsuccess?.();queueMicrotask(()=>{if(aborted)return;if(fail&&mode==='readwrite'){tx.onerror?.();return;}if(staged){if(staged.value===null)rows.delete(staged.key);else rows.set(staged.key,structuredClone(staged.value));}tx.oncomplete?.()})});return req},
    put(value,key){staged={key,value}},delete(key){staged={key,value:null}}
   }}};return tx;}};
  last=request.result;request.onsuccess();});return request;}};
 return {api,rows,fail(value){fail=value},versionchange(){last.onversionchange()},stats:()=>({opens,closed})};
}
test('IndexedDB adapter só confirma depois do commit e mantém registro anterior se a transação abortar',async()=>{
 const db=fakeIndexedDB(),store=createLocalData(db.api);await store.set('profile:1',{a:1});assert.deepEqual(await store.get('profile:1'),{a:1});
 await store.update('profile:1',old=>({...old,b:2}));db.fail(true);await assert.rejects(store.set('profile:1',{bad:true}));
 assert.deepEqual(await store.get('profile:1'),{a:1,b:2});db.fail(false);await store.remove('profile:1');assert.equal(await store.get('profile:1'),null);
});
test('versionchange fecha conexão antiga e próximo acesso reabre o banco',async()=>{
 const db=fakeIndexedDB(),store=createLocalData(db.api);await store.get('a');db.versionchange();await store.get('a');assert.deepEqual(db.stats(),{opens:2,closed:1});
});
test('navegador sem IndexedDB rejeita armazenamento em vez de fingir persistência',async()=>{
 await assert.rejects(createLocalData(null).set('a',1),/indisponível/);
});
