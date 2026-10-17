import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  validSnapshotId, rememberSnapshot, savedSnapshot, forgetSnapshot, snapshotPath, readSavedSnapshot
} from '../public/saved-catalog.js';

const good = '123e4567-e89b-42d3-a456-426614174000';
const path = file => readFileSync(new URL('../public/' + file, import.meta.url), 'utf8');
function storage() {
  const data = new Map();
  return {
    getItem: k => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); },
    removeItem: k => { data.delete(k); },
    entries: () => [...data.values()]
  };
}

test('Memoriza só ID do R2; nenhuma playlist nem credencial em armazenamento', () => {
  const store = storage();
  assert.equal(rememberSnapshot(good, store), true);
  assert.equal(savedSnapshot(store), good);
  assert.ok(store.entries().every(v => !/https?:|get.php|password|username/i.test(v)));
  assert.equal(snapshotPath(good), '/api/bridge/playlist?id=' + good);
  assert.equal(forgetSnapshot(store), true);
  assert.equal(savedSnapshot(store), null);
});
test('IDs arbitrários, URLs e XSS não viram referência R2', () => {
  const store = storage();
  for (const value of ['https://provider/?password=123', '../api/metadata/status', '<img>', '123', '/api/bridge/playlist?id=x']) {
    assert.equal(validSnapshotId(value), false);
    assert.equal(rememberSnapshot(value, store), false);
    assert.throws(() => snapshotPath(value));
  }
  assert.equal(savedSnapshot(store), null);
});
test('Restauro consulta endpoint autenticado e mantém ID após 401', async () => {
  let called;
  const unavailable = await readSavedSnapshot(good, async (url, options) => {
    called = [url, options];
    return { ok: false, status: 401 };
  });
  assert.equal(called[0], snapshotPath(good));
  assert.equal(called[1].credentials, 'same-origin');
  assert.equal(called[1].cache, 'no-store');
  assert.equal(unavailable.kind, 'needs-session');
  const restored = await readSavedSnapshot(good, async () => ({ ok: true, text: async () => '#EXTM3U\n#EXTINF:-1,Demo\nhttps://example.com/live.m3u8' }));
  assert.equal(restored.kind, 'ok');
  assert.ok(restored.content.startsWith('#EXTM3U'));
});
test('Cinema persiste snapshot após importação e restaura somente com cookie válido', () => {
  const js = path('cinema-app.js');
  for (const required of ["lastSnapshotId = result.catalogId", "rememberSnapshot(snapshotId)", "savedSnapshot()", "readSavedSnapshot(id)", "bridgeStatus.connected", "setChannels(entries, 'R2 (biblioteca restaurada)', id)", "forgetSnapshot()"]) {
    assert.ok(js.includes(required), required);
  }
  assert.ok(js.includes("lastSnapshotId = null"));
  const original = path('app.js');
  assert.ok(!original.includes('saved-catalog.js'));
  assert.ok(!original.includes('readSavedSnapshot'));
});
test('Aplicar e salvar realmente grava e mostra estado do TMDB', () => {
  const html = path('cinema.html'), js = path('home.js');
  for (const marker of ['Aplicar e salvar', 'id="cinema-feedback"', 'id="admin-tmdb-status"', 'id="admin-save-status"']) assert.ok(html.includes(marker));
  assert.ok(js.includes("if (!await write('settings', next)"));
  assert.ok(js.includes("'✓ Personalização aplicada e salva no seu perfil.'"));
  assert.ok(js.includes("fetch('/api/metadata/status'"));
  assert.ok(js.includes("tmdbCalls = 0"));
});
test('Status do TMDB não divulga chave e só considera pronto com D1', () => {
  const status = readFileSync(new URL('../functions/api/metadata/status.js', import.meta.url), 'utf8');
  assert.ok(status.includes('TMDB_API_KEY'));
  assert.ok(status.includes('env?.DB?.prepare'));
  assert.ok(!status.includes('JSON.stringify(env'));
});

test('Após expirar o cookie, a interface permite reconectar com a chave sem reimportar URL', () => {
  const js = path('cinema-app.js'), html = path('cinema.html');
  assert.ok(html.includes('id="restore-library"'));
  assert.ok(html.includes('id="restore-library-panel"'));
  assert.ok(js.includes("fetch('/api/bridge/connect'"));
  assert.ok(js.includes('await restoreSavedLibrary()'));
  assert.ok(js.includes("els.bridgeKey.value = ''"));
  assert.ok(js.includes('sourceLoad++'), 'Mudanças de fonte devem cancelar restauração em andamento.');
});
