import test from 'node:test';
import assert from 'node:assert/strict';
import {createImagePreloader} from '../public/artwork-preload.js';

test('preload limita downloads, compartilha URLs e espera decode',async()=>{
 const started=[];const decodes=[];
 class Image {set src(url){this.url=url;started.push(this)} decode(){return new Promise(resolve=>decodes.push(resolve))}}
 const preload=createImagePreloader({ImageClass:Image,concurrency:2,timeoutMs:1000});
 const a=preload('a'),b=preload('b'),c=preload('c');
 assert.equal(preload('a'),a);assert.equal(started.length,2);
 started[0].onload();await Promise.resolve();assert.equal(started.length,2);
 decodes[0]();assert.equal(await a,true);assert.equal(started.length,3);
 started[1].onerror();assert.equal(await b,false);
 started[2].onload();decodes[1]();assert.equal(await c,true);
});
test('falha ou timeout da imagem não prende a fila',async()=>{
 class Image {set src(value){}}
 const preload=createImagePreloader({ImageClass:Image,concurrency:1,timeoutMs:5});
 assert.deepEqual(await Promise.all([preload('a'),preload('b'),preload('')]),[false,false,false]);
});
