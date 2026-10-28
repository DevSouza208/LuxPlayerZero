import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfileStore} from '../public/profile-store.js';
test('escritas são serializadas, preservam campos e usam versão do servidor',async()=>{
 const requests=[];const store=await createProfileStore(async(url,options)=>{
  if(!options.body)return Response.json({profileId:'p1',version:3,value:{settings:{density:'compact'}}});
  const body=JSON.parse(options.body);requests.push(body);return Response.json({version:body.version+1});
 });
 await Promise.all([store.write('favorites',[{key:'a'}]),store.write('recent',[{key:'b'}])]);
 assert.deepEqual(requests.map(x=>x.version),[3,4]);assert.equal(requests[1].value.favorites[0].key,'a');
 assert.equal(requests[1].value.settings.density,'compact');assert.equal(requests[1].profileId,'p1');
});
test('conflito não é salvo como sucesso nem sobrescreve outro dispositivo',async()=>{
 let writes=0;const store=await createProfileStore(async(url,options)=>{
  if(!options.body)return Response.json({profileId:'p',version:0,value:{}});
  writes++;return Response.json({error:'Recarregue.'},{status:409});
 });
 await assert.rejects(store.write('favorites',[]),/Recarregue/);
 await assert.rejects(store.write('recent',[]),/Recarregue/);assert.equal(writes,1);
});
test('429 respeita cooldown e não bloqueia permanentemente o perfil',async()=>{
 const old=Date.now;let now=100000,writes=0;Date.now=()=>now;
 try{
  const store=await createProfileStore(async(url,options)=>{
   if(!options.body)return Response.json({profileId:'p',version:0,value:{}});
   writes++;if(writes===1)return Response.json({error:'Tente novamente mais tarde.'},{status:429,headers:{'retry-after':'60'}});
   return Response.json({version:1});
  });
  await assert.rejects(store.write('recent',[]),/mais tarde/);
  await assert.rejects(store.write('recent',[]),/mais tarde/);assert.equal(writes,1);
  now+=60001;assert.equal(await store.write('recent',[]),true);assert.equal(writes,2);
 }finally{Date.now=old}
});
