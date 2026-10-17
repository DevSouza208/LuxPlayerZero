import test from 'node:test';
import assert from 'node:assert/strict';
import {spatialNeighbor} from '../public/catalog-navigation.js';
const rect=(left,top,width=100,height=140)=>({left,top,width,height});
test('setas seguem linha/coluna e não saltam para diagonal mais próxima',()=>{
 const positions=[rect(0,0),rect(120,0),rect(240,0),rect(0,160),rect(120,160),rect(240,160)];
 assert.equal(spatialNeighbor(positions,0,'ArrowRight'),1);
 assert.equal(spatialNeighbor(positions,1,'ArrowDown'),4);
 assert.equal(spatialNeighbor(positions,4,'ArrowUp'),1);
 assert.equal(spatialNeighbor(positions,0,'ArrowLeft'),-1);
 assert.equal(spatialNeighbor(positions,0,'Enter'),-1);
 assert.equal(spatialNeighbor([rect(0,0),rect(10,150),rect(300,0)],0,'ArrowRight'),2);
});
