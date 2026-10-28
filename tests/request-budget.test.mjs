import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequestBudget,metadataRequestBudget} from '../src/request-budget.js';
import {playbackErrorMessage} from '../public/playback-errors.js';

test('limites independentes por usuário e categoria sem acessar D1',async()=>{
 let clock=1000;const check=createRequestBudget({now:()=>clock});
 const env={get DB(){throw Error('D1 must not be touched')}};
 for(let i=0;i<30;i++)assert.equal(await check(env,'one','sync'),null);
 const blocked=await check(env,'one','sync');assert.equal(blocked.status,429);
 assert.equal(blocked.headers.get('retry-after'),'60');assert.equal(blocked.headers.get('cache-control'),'no-store');
 assert.match((await blocked.json()).error,/Tente novamente mais tarde/);
 assert.equal(await check(env,'two','sync'),null);assert.equal(await check(env,'one','account'),null);
 clock+=60001;assert.equal(await check(env,'one','sync'),null);
});
test('binding usa identidade verificada compartilhada entre sessões; falha tem fallback sem D1',async()=>{
 const check=createRequestBudget();let received;
 const env={PROFILE_SYNC_LIMIT:{async limit(input){received=input;return {success:false}}}};
 assert.equal((await check(env,'usuario:42','sync')).status,429);
 assert.deepEqual(received,{key:'sync:usuario:42'});
 env.PROFILE_SYNC_LIMIT.limit=()=>{throw Error('offline')};
 assert.equal(await check(env,'usuario:42','sync'),null);
});
test('mídia, assets e status não entram no orçamento de metadados',async()=>{
 for(const path of ['/api/bridge/media','/api/metadata/status','/cinema/sw.js']){
  const env={get DB(){throw Error('no db')},get METADATA_REQUEST_LIMIT(){throw Error('no limit')}};
  assert.equal(await metadataRequestBudget(new Request('https://lux.example'+path),env),null);
 }
});
test('metadados usam hash do cookie e não interpretam isso como autenticação',async()=>{
 let key;const token='a'.repeat(64);
 await metadataRequestBudget(new Request('https://lux.example/api/metadata/details',{method:'POST',headers:{cookie:'__Host-lux_account='+token}}),{METADATA_REQUEST_LIMIT:{limit:async input=>{key=input.key;return {success:true}}}});
 assert.match(key,/^metadata:[a-f0-9]{64}$/);assert.ok(!key.includes(token));
});
test('mensagem de rede difere de codec e nunca expõe endereço da fonte',()=>{
 assert.match(playbackErrorMessage(2),/Falha na conexão/);
 assert.match(playbackErrorMessage('timeout'),/Falha na conexão/);
 assert.match(playbackErrorMessage(3),/incompatível/);
 assert.match(playbackErrorMessage(4),/não compatível/);
 assert.doesNotMatch(playbackErrorMessage('https://private.example/password'),/https|password/);
});
