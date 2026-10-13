import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bridgeReady, mediaReady, permittedUrl, connect, status, catalog, sign, media,
  seal, unseal, rewriteHls, fetchAllowed
} from '../src/bridge-core.js';

const origin = 'https://luxzero.example';
const env = {
  BRIDGE_ACCESS_KEY: 'secure-unit-test-only-gateway-password-123456',
  BRIDGE_ALLOWED_HOSTS: 'stream.example.org:8080 playlist.example.org',
  BRIDGE_MEDIA_ENABLED: 'true'
};
const post = (route, value, cookie = '') => new Request(origin + '/api/bridge/' + route, {
  method: 'POST',
  headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(value)
});
async function signedCookie() {
  const response = await connect(post('connect', { key: env.BRIDGE_ACCESS_KEY }), env);
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';')[0];
}

test('backend não ativa sem segredo forte e allowlist', () => {
  assert.equal(bridgeReady({}), false);
  assert.equal(bridgeReady({ BRIDGE_ACCESS_KEY: '123', BRIDGE_ALLOWED_HOSTS: 'stream.example.org' }), false);
  assert.equal(mediaReady({ ...env, BRIDGE_MEDIA_ENABLED: 'false' }), false);
  assert.equal(bridgeReady(env), true);
});

test('gateway rejeita rede privada, host desconhecido e credenciais na autoridade', () => {
  assert.throws(() => permittedUrl('http://127.0.0.1:80/internal', env), /Host/);
  assert.throws(() => permittedUrl('http://stream.example.org.evil.org/x', env), /não liberado/);
  assert.throws(() => permittedUrl('http://user:pw@playlist.example.org/x', env), /credenciais/);
  assert.throws(() => permittedUrl('file:///etc/passwd', env), /HTTP/);
  assert.equal(permittedUrl('http://stream.example.org:8080/a.m3u8', env).hostname, 'stream.example.org');
});

test('chave válida cria cookie seguro HttpOnly; cookie não revela chave', async () => {
  const forbidden = await connect(post('connect', { key: 'nope' }), env);
  assert.equal(forbidden.status, 403);
  const sessionResponse = await connect(post('connect', { key: env.BRIDGE_ACCESS_KEY }), env);
  const cookie = sessionResponse.headers.get('set-cookie');
  assert.equal(sessionResponse.status, 200);
  assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/);
  assert.doesNotMatch(cookie, /secure-unit-test-only/);
  const current = await status(new Request(origin + '/api/bridge/status', { headers: { cookie: cookie.split(';')[0] } }), env);
  assert.equal((await current.json()).connected, true);
});

test('não aceita ação cross-origin e não fornece catálogo sem sessão', async () => {
  const x = await connect(new Request(origin + '/api/bridge/connect', {
    method: 'POST', headers: { origin: 'https://evil.example' }, body: JSON.stringify({ key: env.BRIDGE_ACCESS_KEY })
  }), env);
  assert.equal(x.status, 403);
  const unauthorized = await catalog(post('catalog', { url: 'http://playlist.example.org/get.php' }), env);
  assert.equal(unauthorized.status, 401);
});

test('ponte de catálogo HTTP devolve M3U sobre HTTPS autenticado sem expor segredos', async () => {
  const cookie = await signedCookie();
  const m3u = '#EXTM3U\n#EXTINF:-1,Estação de teste\nhttp://stream.example.org:8080/live/1.m3u8';
  const requests = [];
  const response = await catalog(post('catalog', { url: 'http://playlist.example.org/get.php?username=test&password=hidden' }, cookie),
    env, async (url, options) => {
      requests.push({ url, redirect: options.redirect });
      return new Response(m3u, { headers: { 'content-type': 'audio/x-mpegurl' } });
    });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).content, m3u);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(requests[0].redirect, 'manual');
});

test('redirecionamentos nunca pulam lista explícita de domínios', async () => {
  let attempts = 0;
  await assert.rejects(() => fetchAllowed('http://playlist.example.org/list', env, {},
    async () => { attempts++; return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } }); }),
  /Host/);
  assert.equal(attempts, 1);
});

test('mídia não pode ser assinada sem habilitação deliberada', async () => {
  const cookie = await signedCookie();
  const response = await sign(post('sign', { url: 'http://stream.example.org:8080/live/test.m3u8' }, cookie),
    { ...env, BRIDGE_MEDIA_ENABLED: 'false' });
  assert.equal(response.status, 503);
});

test('HLS em HTTP reescreve segmentos, playlists variantes e mapas para HTTPS local', async () => {
  const cookie = await signedCookie();
  const target = 'http://stream.example.org:8080/live/test.m3u8';
  const signed = await sign(post('sign', { url: target }, cookie), env);
  assert.equal(signed.status, 200);
  const output = await signed.json();
  assert.match(output.url, /^\/api\/bridge\/media\?token=/);
  const input = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:6,\nsegment-001.ts\n#EXT-X-STREAM-INF:BANDWIDTH=1280000\nlower.m3u8';
  const response = await media(new Request(origin + output.url, { headers: { cookie } }), env,
    async url => {
      assert.equal(url, target);
      return new Response(input, { headers: { 'content-type': 'application/vnd.apple.mpegurl' } });
    });
  assert.equal(response.status, 200);
  const rewritten = await response.text();
  assert.doesNotMatch(rewritten, /http:\/\/stream\.example\.org/);
  assert.match(rewritten, /URI="\/api\/bridge\/media\?token=/);
  const segments = rewritten.split('\n').filter(v => v.startsWith('/api/bridge/media?token='));
  assert.equal(segments.length, 2);
  const restored = await unseal(new URL(origin + segments[0]).searchParams.get('token'), env);
  assert.equal(restored.url, 'http://stream.example.org:8080/live/segment-001.ts');
});

test('relay de bytes funciona com resposta Range sem buffering completo', async () => {
  const cookie = await signedCookie();
  const signed = await sign(post('sign', { url: 'http://stream.example.org:8080/audio.mp3' }, cookie), env);
  const path = (await signed.json()).url;
  const response = await media(new Request(origin + path, { headers: { cookie, range: 'bytes=0-3' } }), env,
    async (_url, init) => {
      assert.equal(init.headers.Range, 'bytes=0-3');
      return new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 206, headers: { 'content-type': 'audio/mpeg', 'content-range': 'bytes 0-3/99' }
      });
    });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 0-3/99');
  assert.deepEqual(Array.from(new Uint8Array(await response.arrayBuffer())), [1,2,3,4]);
});

test('tokens lacrados expiram e não expõem URL com credenciais', async () => {
  const token = await seal({ scope:'bridge-media', url:'http://playlist.example.org/get.php?username=abc&password=secret', exp:Date.now()+60000 }, env);
  assert.doesNotMatch(token, /secret|password|username/);
  assert.equal((await unseal(token, env)).scope, 'bridge-media');
  await assert.rejects(() => unseal(await seal({ exp:Date.now()-1 }, env), env), /expirada/);
});
