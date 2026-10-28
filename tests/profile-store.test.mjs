import test from 'node:test';import assert from 'node:assert/strict';
import {createProfileStore} from '../public/profile-store.js';import {memoryStorage,clock} from './helpers/local-memory.mjs';
const row=(key,position=0,at=1000)=>({key,name:key,group:'Teste',position,duration:600,at});
function setup({storage=memoryStorage(),profileId='p1',value={},version=0,fail=null}={}){
 const time=clock(),requests=[],remote={profileId,value,version};let failure=fail;
 const fetcher=async(url,options={})=>{
  if(!options.body)return Response.json(structuredClone(remote));
  const body=JSON.parse(options.body);requests.push(body);
  if(failure)return Response.json({error:'Indisponível'},{status:failure,headers:{'retry-after':'60'}});
  if(body.version!==remote.version)return Response.json({error:'Conflito'},{status:409});
  remote.value=body.value;remote.version++;return Response.json({version:remote.version});
 };
 return {storage,time,requests,remote,fetcher,fail(code){failure=code},options:{storage,...time,events:null,locks:null,onStatus(){}},create(){return createProfileStore(fetcher,this.options)}};
}
test('salva progresso localmente sem POST a cada atualização e coalesce na sincronização',async()=>{
 const c=setup(),store=await c.create();
 for(let i=1;i<=12;i++){c.time.advance(10000);await store.write('recent',[row('a',i*10,c.time.now())]);}
 assert.equal(c.requests.length,0);assert.equal(store.read('recent',[])[0].position,120);
 assert.ok(c.storage.rows.has('profile:p1'));await store.flush();assert.equal(c.requests.length,1);assert.equal(c.remote.value.recent[0].position,120);assert.equal(store.pending(),false);store.dispose();
});
test('pendências sobrevivem à recriação do store e só são enviadas para seu perfil',async()=>{
 const storage=memoryStorage(),c=setup({storage}),a=await c.create();await a.write('favorites',[row('a')]);a.dispose();
 const b=await c.create();assert.equal(b.read('favorites',[])[0].key,'a');assert.equal(b.pending(),true);
 const other=setup({storage,profileId:'p2'}),p2=await other.create();assert.deepEqual(p2.read('favorites',[]),[]);await p2.flush();assert.equal(other.requests.length,0);
 await b.flush();assert.equal(c.requests[0].profileId,'p1');b.dispose();p2.dispose();
});
test('409 mescla favorito de outro dispositivo e conserva alteração local sem sobrescrever configurações',async()=>{
 const c=setup({value:{settings:{density:'compact'},favorites:[row('old')]}}),store=await c.create();
 await store.write('favorites',[row('old'),row('local')]);
 c.remote.value.favorites.push(row('remote'));c.remote.value.settings.density='large';c.remote.version++;
 await store.flush();assert.equal(c.requests.length,2);assert.deepEqual(new Set(c.remote.value.favorites.map(x=>x.key)),new Set(['old','local','remote']));assert.equal(c.remote.value.settings.density,'large');store.dispose();
});
test('remover favorito não ressuscita item e progresso mais novo de outro dispositivo vence',async()=>{
 const c=setup({value:{favorites:[row('a')],recent:[row('ep',10,1000)]}}),store=await c.create();
 c.time.advance(1000);await store.write('favorites',[]);await store.write('recent',[row('ep',20,2000)]);
 c.remote.value.recent=[row('ep',90,5000)];c.remote.version++;
 await store.flush();assert.deepEqual(c.remote.value.favorites,[]);assert.equal(c.remote.value.recent[0].position,90);store.dispose();
});
test('rede/429 mantém outbox e agenda retry respeitando Retry-After',async()=>{
 const c=setup({fail:429}),store=await c.create();await store.write('favorites',[row('a')]);await assert.rejects(store.flush());
 assert.equal(store.pending(),true);assert.ok([...c.time.jobs.values()].some(job=>job.at>=c.time.now()+60000));
 c.fail(null);c.time.advance(61000);await store.flush();assert.equal(store.pending(),false);store.dispose();
});
test('alteração feita durante upload não é apagada pelo ACK anterior',async()=>{
 const c=setup(),original=c.fetcher;let release,started;const start=new Promise(r=>started=r);
 const fetcher=async(url,options)=>{if(options?.body&&release===undefined){started();await new Promise(r=>release=r);}return original(url,options)};
 const store=await createProfileStore(fetcher,c.options);await store.write('recent',[row('a',10)]);
 const send=store.flush();await start;c.time.advance(10000);await store.write('recent',[row('a',20,11000)]);release();await send;
 assert.equal(store.pending(),true);assert.equal(store.read('recent',[])[0].position,20);await store.flush();assert.equal(c.remote.value.recent[0].position,20);store.dispose();
});
test('duas abas compartilham outbox sem perder favoritos distintos',async()=>{
 const c=setup(),a=await c.create(),b=await c.create();await Promise.all([a.write('favorites',[row('a')]),b.write('favorites',[row('b')])]);
 await b.flush();assert.deepEqual(new Set(c.remote.value.favorites.map(x=>x.key)),new Set(['a','b']));a.dispose();b.dispose();
});
test('sem IndexedDB a sessão continua e usa fallback temporário com aviso',async()=>{
 const c=setup({storage:{async update(){throw Error('blocked')},async get(){throw Error('blocked')}}}),messages=[];
 const store=await createProfileStore(c.fetcher,{...c.options,onStatus:(state,message)=>messages.push({state,message})});
 await store.write('favorites',[row('a')]);assert.ok(messages.some(x=>x.message?.includes('Armazenamento local')));await store.flush();assert.equal(c.remote.value.favorites[0].key,'a');store.dispose();
});
test('estado sem mudanças não gera POST nem pendência',async()=>{
 const c=setup({value:{recent:[row('a',20)]}}),store=await c.create();await store.write('recent',[row('a',20,2000)]);await store.flush();assert.equal(c.requests.length,0);store.dispose();
});
test('UI com snapshot antigo não remove favoritos remotos que ainda não exibiu',async()=>{
 const c=setup(),store=await c.create();store.read('favorites',[]);await store.write('favorites',[row('local')]);
 c.remote.value={favorites:[row('remote')]};c.remote.version++;
 await store.flush();
 await store.write('favorites',[row('local'),row('another')]);await store.flush();
 assert.deepEqual(new Set(c.remote.value.favorites.map(x=>x.key)),new Set(['local','remote','another']));store.dispose();
});
test('upload não é repetido antes do Retry-After por sair e voltar à aba',async()=>{
 const c=setup({fail:429}),store=await c.create();await store.write('favorites',[row('a')]);await assert.rejects(store.flush());
 for(let i=0;i<4;i++)assert.equal(await store.flush(),false);assert.equal(c.requests.length,1);store.dispose();
});
test('Web Locks evita dois uploads simultâneos da mesma fila',async()=>{
 const c=setup(),locks={async request(name,options,callback){assert.equal(name,'lux-sync:p1');assert.equal(options.ifAvailable,true);return callback(null)}};
 const store=await createProfileStore(c.fetcher,{...c.options,locks});await store.write('favorites',[row('a')]);assert.equal(await store.flush(),false);assert.equal(c.requests.length,0);assert.equal(store.pending(),true);store.dispose();
});
test('alteração de perfil durante conflito mantém a fila original e suspende upload',async()=>{
 const c=setup(),store=await c.create();await store.write('favorites',[row('a')]);c.remote.profileId='other';c.remote.version++;
 await assert.rejects(store.flush(),/perfil mudou/);assert.equal(store.pending(),true);assert.equal(await store.flush(),false);assert.equal(c.requests.length,1);store.dispose();
});
test('visibilitychange e retorno da rede acionam flush sem precisar esperar cinco minutos',async()=>{
 const c=setup(),handlers={},docHandlers={};const events={document:{visibilityState:'hidden',addEventListener:(key,fn)=>docHandlers[key]=fn,removeEventListener:key=>delete docHandlers[key]},addEventListener:(key,fn)=>handlers[key]=fn,removeEventListener:key=>delete handlers[key]};
 const store=await createProfileStore(c.fetcher,{...c.options,events});await store.write('recent',[row('a',50)]);docHandlers.visibilitychange();await store.flush();assert.equal(c.requests.length,1);
 await store.write('favorites',[row('a')]);handlers.online();await store.flush();assert.equal(c.requests.length,2);store.dispose();assert.deepEqual(handlers,{});assert.deepEqual(docHandlers,{});
});
