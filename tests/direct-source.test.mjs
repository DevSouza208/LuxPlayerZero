import test from 'node:test';
import assert from 'node:assert/strict';
import { preferHttps, xtreamM3uUrl } from '../public/direct-source.js';

test('URL HTTP usa HTTPS na porta padrão sem perder caminho e credenciais da M3U', () => {
  assert.equal(
    preferHttps('http://midia.example:80/live/usuario/senha/123.ts?token=abc'),
    'https://midia.example/live/usuario/senha/123.ts?token=abc'
  );
});
test('HTTPS existente e portas personalizadas permanecem intactas', () => {
  assert.equal(preferHttps('https://midia.example/live/a.m3u8'), 'https://midia.example/live/a.m3u8');
  assert.equal(preferHttps('http://midia.example:8080/live/a.ts'), 'https://midia.example:8080/live/a.ts');
});
test('M3U Xtream usa endpoint get.php sem reconstruir URL de canais', () => {
  assert.equal(
    xtreamM3uUrl('http://midia.example:80', 'usuario', 'senha'),
    'http://midia.example/get.php?username=usuario&password=senha&type=m3u_plus&output=mpegts'
  );
});
test('fluxo original no player prefere HTTPS direto e M3U pronta', async () => {
  const {readFileSync} = await import('node:fs');
  const src=readFileSync(new URL('../public/app.js', import.meta.url),'utf8');
  assert.ok(src.includes('preferHttps(item.url)'), 'Falta testar HTTPS direto na reprodução.');
  assert.ok(src.includes('xtreamM3uUrl(base, user, pass)'), 'Falta carregar a M3U pronta do Xtream.');
  assert.ok(src.includes('parseM3u(playlistText, m3uUrl)'), 'Falta aproveitar o parser existente.');
  assert.ok(!src.includes("const sourceUrl = isBridgeRequired(item.url) ? await bridge.media(item.url) : item.url;"),
    'Não bloquear a reprodução por depender primeiro da ponte.');
});

test('parser mantém HTTP na lista; HTTPS só é escolhido na hora de tocar', async () => {
  const { readFileSync } = await import('node:fs');
  const { parseM3u } = await import('../public/playlist.js');
  const content = readFileSync(new URL('../public/demo/playlist.m3u', import.meta.url), 'utf8');
  const items = parseM3u(content);
  const channel = items.find(item => item.name.includes('HTTP'));
  assert.ok(channel);
  assert.ok(channel.url.startsWith('http://'));
  assert.equal(preferHttps(channel.url), 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8');
});
