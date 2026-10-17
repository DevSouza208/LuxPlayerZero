import {isGuestMode} from './guest-mode.js';
/**
 * Restauro seguro do catálogo: guarda APENAS o identificador aleatório do R2.
 * Não armazenar em storage URL M3U/Xtream, cookies, tokens ou linhas EXTINF.
 * A rota do catálogo continua autenticada pelo cookie HttpOnly do gateway.
 */
const KEY = 'luxzero:cinema:catalogRef:v1';
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validSnapshotId(value) {
  return typeof value === 'string' && ID.test(value);
}

export function rememberSnapshot(catalogId, storage = null) {
  if(!storage&&isGuestMode())return false;
  if (!validSnapshotId(catalogId)) return false;
  try {
    (storage || localStorage).setItem(KEY, JSON.stringify({ id: catalogId, savedAt: Date.now() }));
    return true;
  } catch { return false; }
}

export function savedSnapshot(storage = null) {
  if(!storage&&isGuestMode())return null;
  try {
    const value = JSON.parse((storage || localStorage).getItem(KEY));
    if (!validSnapshotId(value?.id)) return null;
    return value.id;
  } catch { return null; }
}

export function forgetSnapshot(storage = null) {
  if(!storage&&isGuestMode())return true;
  try { (storage || localStorage).removeItem(KEY); return true; } catch { return false; }
}

export function snapshotPath(id) {
  if (!validSnapshotId(id)) throw new Error('Catálogo inválido.');
  return '/api/bridge/playlist?id=' + id;
}

export async function readSavedSnapshot(id, fetcher = fetch) {
  const response = await fetcher(snapshotPath(id), {
    method: 'GET', credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer'
  });
  if (!response.ok) {
    const status = response.status;
    if (status === 401) return { kind: 'needs-session', content: null };
    if (status === 404) return { kind: 'not-found', content: null };
    return { kind: 'unavailable', content: null };
  }
  return { kind: 'ok', content: await response.text() };
}
