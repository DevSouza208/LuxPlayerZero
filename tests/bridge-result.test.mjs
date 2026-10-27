import test from 'node:test';
import assert from 'node:assert/strict';
import {bridgeResult} from '../public/gateway.js';
test('erro de runtime Cloudflare preserva diagnóstico seguro sem imprimir HTML',async()=>{
 const result=await bridgeResult(new Response('<html>1102 Worker exceeded resource limits source-password</html>',{status:503,headers:{'cf-ray':'abc123-GRU'}}));
 assert.match(result.error,/limite de processamento/);assert.match(result.error,/abc123-GRU/);assert.doesNotMatch(result.error,/source-password|<html>/);
});
test('erro JSON do aplicativo mantém a etapa da falha e erro genérico indica preservação',async()=>{
 assert.deepEqual(await bridgeResult(Response.json({error:'D1 indisponível'},{status:503})),{error:'D1 indisponível'});
 const result=await bridgeResult(new Response('Service unavailable',{status:503}));assert.match(result.error,/HTTP 503/);assert.match(result.error,/preservada/);
});
