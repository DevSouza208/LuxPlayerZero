import test from 'node:test';
import assert from 'node:assert/strict';
import { describeBridge } from '../public/bridge-state.js';

test('ausência de configuração não pede chave que não pode funcionar', () => {
  const view = describeBridge({ configured:false, connected:false, mediaEnabled:false }, false);
  assert.equal(view.kind, 'unconfigured');
  assert.equal(view.showKey, false);
  assert.match(view.message, /Cloudflare/i);
});

test('configurado e sem sessão orienta digitar chave privada', () => {
  const view = describeBridge({ configured:true, connected:false, mediaEnabled:false }, false);
  assert.equal(view.kind, 'needs-key');
  assert.equal(view.showKey, true);
  assert.match(view.message, /chave/i);
});

test('catálogo conectado diferencia vídeo HTTP desabilitado de gateway quebrado', () => {
  const view = describeBridge({ configured:true, connected:true, mediaEnabled:false }, true);
  assert.equal(view.kind, 'catalog-only');
  assert.equal(view.showKey, false);
  assert.match(view.message, /vídeo|mídia|transmissão/i);
});

test('mídia habilitada e sessão conectada informa ponte pronta', () => {
  const view = describeBridge({ configured:true, connected:true, mediaEnabled:true }, true);
  assert.equal(view.kind, 'ready');
  assert.equal(view.showKey, false);
});

test('status em leitura não finge conexão com o servidor', () => {
  const view = describeBridge(null, false);
  assert.equal(view.kind, 'checking');
  assert.equal(view.showKey, false);
});

test('player exibe status real do Pages em vez de consultar a API de outro Worker', async () => {
  const { readFileSync } = await import('node:fs');
  const markup = readFileSync(new URL('../public/player.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(markup, /id="bridge-availability"/);
  assert.match(script, /api\/bridge\/status/);
  assert.doesNotMatch(script, /fetch\('\/api\/health'/);
});
