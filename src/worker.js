import { lookupTmdb } from './tmdb-metadata.js';
import { importGuestPlaylist } from './guest-playlist.js';
import { detailMetadata } from './detail-metadata.js';
import { catalogSearchApi } from './catalog-search.js';
import { editorialApi } from './editorial-api.js';
import { accountApi } from './account-api.js';
import { accountGate } from './account-gate.js';
/* Lux Player Zero — Worker mínimo: não retransmite conteúdo. */
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer'
  }
});
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/metadata/status' && request.method === 'GET') return json({configured:Boolean(env.TMDB_API_KEY?.trim() && env.DB?.prepare)});
    if (url.pathname === '/api/metadata/tmdb') return lookupTmdb(request, env);
    if (url.pathname === '/api/bridge/import') return importGuestPlaylist(request, env);
    if (url.pathname === '/api/metadata/details') return detailMetadata(request, env);
    if (url.pathname === '/api/catalog/search') return catalogSearchApi(request, env);
    if (url.pathname.startsWith('/api/editorial/')) return editorialApi(request, env);
    if (url.pathname.startsWith('/api/account/')) return accountApi(request, env);
    const blocked = await accountGate(request, env);
    if (blocked) return blocked;
    if (url.pathname === '/api/health' && request.method === 'GET') {
      return json({
        ok: true,
        app: 'lux-player-zero',
        version: '0.1.0',
        bindings: { d1: Boolean(env.DB), r2: Boolean(env.MEDIA_BUCKET) }
      });
    }
    if (url.pathname.startsWith('/api/')) {
      return json({ ok: false, error: 'Endpoint não encontrado.' }, 404);
    }
    return env.ASSETS.fetch(request);
  }
};
