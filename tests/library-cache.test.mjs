import test from 'node:test';import assert from 'node:assert/strict';
import {createLibraryCache,libraryCacheKey} from '../public/library-cache.js';import {memoryStorage} from './helpers/local-memory.mjs';
const id='00000000-0000-4000-8000-000000000001',source='/api/bridge/playlist?id='+id,version='a'.repeat(64),items=[{name:'Original S01E01',url:'https://source.example/ep.mp4',id:'c0'}];
const manifest=(v=version)=>Response.json({schemaVersion:1,catalogId:id,contentVersion:v,itemCount:1,bytes:80});
const options={profileId:'p1',source,catalogId:id,download:async()=> '#EXTM3U\n#EXTINF:-1,Original\nhttps://source.example/ep.mp4\n',prepare:async()=>items};
test('primeira carga prepara e salva; segunda exibe cache e só verifica versão',async()=>{
 const storage=memoryStorage();let downloads=0,parses=0,shown=0,checks=0;
 const load=createLibraryCache({storage,fetcher:async()=>{checks++;return manifest()}});
 const args={...options,download:async()=>{downloads++;return options.download()},prepare:async()=>{parses++;return items},onCached:value=>{shown++;assert.deepEqual(value,items)}};
 assert.equal((await load(args)).changed,true);assert.equal((await load(args)).changed,false);
 assert.equal(checks,2);assert.equal(downloads,1);assert.equal(parses,1);assert.equal(shown,1);
});
test('falha, truncamento ou lista vazia preserva a cópia antiga até a troca validada',async()=>{
 const storage=memoryStorage(),key=await libraryCacheKey('p1',source);
 await storage.set(key,{schemaVersion:1,items,contentVersion:version,checkedAt:0});
 for(const download of [async()=>{throw Error('network')},async()=>'',async()=> '#EXTM3U\n']){
  const load=createLibraryCache({storage,fetcher:async()=>manifest('b'.repeat(64))});const result=await load({...options,download});
  assert.equal(result.cached,true);assert.equal((await storage.get(key)).contentVersion,version);
 }
 const load=createLibraryCache({storage,fetcher:async()=>manifest('b'.repeat(64))});
 await load({...options,prepare:async()=>[]});assert.equal((await storage.get(key)).contentVersion,version);
 await load(options);assert.equal((await storage.get(key)).contentVersion,'b'.repeat(64));
});
test('cache é isolado por perfil e fonte e chaves não expõem credenciais',async()=>{
 const a=await libraryCacheKey('p1','https://source.example/?password=secret');
 assert.doesNotMatch(a,/password|secret/);assert.notEqual(a,await libraryCacheKey('p2','https://source.example/?password=secret'));
 const storage=memoryStorage(),load=createLibraryCache({storage,fetcher:async()=>manifest()});await load(options);
 let shown=0;await assert.rejects(load({...options,profileId:'p2',onCached:()=>shown++,download:async()=>{throw Error('offline')}}));assert.equal(shown,0);
});
test('sem versão em snapshot antigo, cache é reutilizado por um dia sem novo download',async()=>{
 const storage=memoryStorage();let time=1000,downloads=0;
 const load=createLibraryCache({storage,now:()=>time,fetcher:async()=>new Response('',{status:404})});
 const args={...options,download:async()=>{downloads++;return options.download()}};
 await load(args);await load(args);assert.equal(downloads,1);time+=86400001;await load(args);assert.equal(downloads,2);
});
test('401 não inicia download nem usa origem alternativa silenciosamente',async()=>{
 const load=createLibraryCache({storage:memoryStorage(),fetcher:async()=>new Response('',{status:401})});let calls=0;
 await assert.rejects(load({...options,download:async()=>{calls++;return options.download()}}),/Entre novamente/);assert.equal(calls,0);
});
test('IndexedDB cheio não impede primeira reprodução e não finge que cache foi salvo',async()=>{
 let warning='';const load=createLibraryCache({storage:{async get(){throw Error('blocked')},async set(){throw Error('quota')}},fetcher:async()=>manifest()});
 const result=await load({...options,onWarning:message=>warning=message});assert.deepEqual(result.items,items);assert.match(warning,/não conseguiu guardar/);
});
test('arquivo local é lembrado no perfil correto e limpar remove o cache ativo',async()=>{
 const storage=memoryStorage(),load=createLibraryCache({storage});
 await load.remember({profileId:'p1',items,localOnly:true});const restored=await load.restore('p1');assert.deepEqual(restored.items,items);assert.equal(restored.localOnly,true);
 assert.equal(await load.restore('p2'),null);await load.forget('p1');assert.equal(await load.restore('p1'),null);
});
test('mudança de versão durante download faz uma única nova verificação',async()=>{
 let checks=0,downloads=0;const load=createLibraryCache({storage:memoryStorage(),fetcher:async()=>{checks++;return manifest()}});
 await load({...options,download:async()=>{if(downloads++===0)throw Object.assign(Error('changed'),{status:409});return options.download()}});
 assert.equal(checks,2);assert.equal(downloads,2);
});
