import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogCache} from '../public/catalog-cache.js';
function database() {
 const data=new Map();
 return {open(){
  const request={};
  queueMicrotask(()=>{request.result={close(){},transaction(){
   const transaction={objectStore(){return {
    put(value,key){const result={};setTimeout(()=>{data.set(key,structuredClone(value));transaction.oncomplete()},2);return result},
    get(key){const result={};setTimeout(()=>{result.result=structuredClone(data.get(key));transaction.oncomplete()},0);return result},
    delete(key){const result={};setTimeout(()=>{data.delete(key);transaction.oncomplete()},0);return result}
   }}};return transaction;
  }};request.onsuccess()});return request;
 }};
}
test('cache restaura catálogo, substitui atualização e limpa na ordem das ações',async()=>{
 const idb=database(),cache=createCatalogCache(idb);
 const source=[{name:'Duna LEG',url:'https://example.com/movie/1',group:'FILMES'}];
 await cache.save(source);
 assert.deepEqual((await createCatalogCache(idb).read()).items,source);
 await cache.save([{name:'Novo',url:'https://example.com/movie/2'}]);
 assert.equal((await cache.read()).items[0].name,'Novo');
 const save=cache.save(source),clear=cache.clear();await Promise.all([save,clear]);
 assert.equal(await cache.read(),null);
 assert.equal(source[0].name,'Duna LEG');
});
test('armazenamento indisponível não impede o player',async()=>{
 const cache=createCatalogCache(null);
 assert.equal(await cache.save([]),null);
 assert.equal(await cache.read(),null);
 assert.equal(await cache.clear(),null);
});
