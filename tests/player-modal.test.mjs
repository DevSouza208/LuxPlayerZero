import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayerModal} from '../public/player-modal.js';
test('modal move o mesmo host e abre/fecha sem recriar o vídeo',()=>{
 const original=globalThis.document;const nodes=[];let closed=0,focused=0;
 class Node{constructor(){this.events={};this.children=[];this.open=false}setAttribute(){}append(...nodes){this.children.push(...nodes)}addEventListener(name,fn){this.events[name]=fn}showModal(){this.open=true}close(){this.open=false}focus(){focused++}}
 const host=new Node(),video={sameVideo:true};host.children.push(video);
 const body=new Node();body.style={overflow:'auto'};
 globalThis.document={body,activeElement:{isConnected:true,focus(){focused++}},createElement(){const node=new Node();nodes.push(node);return node}};
 try{
  const modal=createPlayerModal(host,{onClose(){closed++}});const shell=nodes[0];
  assert.equal(shell.children[1],host);assert.equal(host.children[0],video);
  modal.open();modal.open();assert.equal(shell.open,true);assert.equal(body.style.overflow,'hidden');
  let prevented=false;shell.events.cancel({preventDefault(){prevented=true}});
  assert.equal(prevented,true);assert.equal(shell.open,false);assert.equal(body.style.overflow,'auto');assert.equal(closed,1);assert.equal(focused,2);
  modal.close();assert.equal(closed,1);assert.equal(host.children[0],video);
 }finally{globalThis.document=original}
});
