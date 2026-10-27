import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

const env = {
  ASSETS: { fetch: async () => new Response('html ativo', { status: 200 }) }
};

test('GET /api/health devolve status sem segredos', async () => {
  const response = await worker.fetch(new Request('https://zero.example/api/health'), env);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.bindings.d1, false);
  assert.equal(data.bindings.r2, false);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('healthcheck detecta bindings opcionais', async () => {
  const response = await worker.fetch(new Request('https://zero.example/api/health'), {
    ...env, DB: {}, MEDIA_BUCKET: {}
  });
  const data = await response.json();
  assert.equal(data.bindings.d1, true);
  assert.equal(data.bindings.r2, true);
});

test('não cria proxy aberto ou rotas API arbitrárias', async () => {
  const response = await worker.fetch(new Request('https://zero.example/api/proxy?url=https://example.org'), env);
  assert.equal(response.status, 404);
});

test('encaminha recursos do frontend ao ASSETS', async () => {
  const response = await worker.fetch(new Request('https://zero.example/index.html'), env);
  assert.equal(await response.text(), 'html ativo');
});

test('Worker inclui handler diário e protege a entrega da playlist',async()=>{
 assert.equal(typeof worker.scheduled,'function');
 const response=await worker.fetch(new Request('https://zero.example/api/bridge/playlist?id=123'),env);
 assert.notEqual(response.status,200);
});
