import test from 'node:test';import assert from 'node:assert/strict';import {vodFailure} from '../src/vod-errors.js';
test('D1 distingue cotas diárias de leitura e gravação e informa renovação UTC',()=>{
 const now=Date.parse('2026-10-28T16:00:00Z');for(const mode of ['read','write']){const result=vodFailure(new Error(`Your account has exceeded D1's free tier daily row ${mode} limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue.`),'seed_titles',now);assert.equal(result.status,429);assert.equal(result.code,'D1_DAILY_'+mode.toUpperCase()+'_LIMIT');assert.equal(result.retryAt,Date.parse('2026-10-29T00:00:00Z'));assert.match(result.error,/21h/);assert.equal(result.stage,'seed_titles');}
});
test('D1 reconhece causas aninhadas e não revela SQL nem credenciais',()=>{
 const result=vodFailure(new Error('wrapped',{cause:new Error('D1_ERROR: no such column: private_token')}));assert.equal(result.code,'VOD_SCHEMA_MISMATCH');assert.ok(!JSON.stringify(result).includes('private_token'));
 const unknown=vodFailure(new Error('failed https://example.test/u/password SECRET'));assert.equal(unknown.code,'VOD_STORAGE_ERROR');assert.ok(!JSON.stringify(unknown).includes('password'));assert.ok(!JSON.stringify(unknown).includes('SECRET'));
});
test('D1 separa armazenamento execução e falha temporária',()=>{
 assert.equal(vodFailure(new Error('SQLITE_FULL database is full')).code,'D1_STORAGE_LIMIT');assert.equal(vodFailure(new Error('too many SQL variables')).code,'D1_REQUEST_LIMIT');assert.equal(vodFailure(new Error('D1 DB storage operation exceeded timeout which caused object to be reset')).code,'D1_TEMPORARY');
});
