import {metadataRequestBudget} from './request-budget.js';
import {vodAdminApi} from './vod-api.js';
import {runVodMaintenance} from './vod-catalog.js';
import {syncCatalog,serveCatalog,refreshDailyCatalogs} from './catalog-snapshot.js';
import {connect,status,catalog,sign,media} from './bridge-core.js';
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
  async scheduled(event, env, ctx) {
    if(event.cron==='0 7 * * *'||event.cron==='* * * * *'){
      if(!env.DB?.prepare)throw new Error('Configure o binding DB no Worker de manutenção do catálogo.');
      // 04h de São Paulo descobre snapshots. Demais execuções retomam lotes pendentes.
      const work=runVodMaintenance(env,{discover:event.cron==='0 7 * * *'});ctx.waitUntil(work);return work;
    }
    const work=refreshDailyCatalogs(env).then(result=>{
      if(result.failed)throw new Error(result.failed+' catálogo(s) não puderam ser atualizados. As cópias anteriores foram preservadas.');
      return result;
    });
    ctx.waitUntil(work);
    return work;
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    const limited=await metadataRequestBudget(request,env);if(limited)return limited;
    if (url.pathname === '/api/admin/vod')return vodAdminApi(request,env);
    if (url.pathname === '/api/metadata/status' && request.method === 'GET') return json({configured:Boolean(env.TMDB_API_KEY?.trim() && env.DB?.prepare)});
    if (url.pathname === '/api/metadata/tmdb') return lookupTmdb(request, env);
    if (url.pathname === '/api/bridge/status' && request.method === 'GET') return status(request,env);
    if (url.pathname === '/api/bridge/connect' && request.method === 'POST') return connect(request,env);
    if (url.pathname === '/api/bridge/sync' && request.method === 'POST') return syncCatalog(request,env);
    if (url.pathname === '/api/bridge/playlist' && request.method === 'GET') return serveCatalog(request,env);
    if (url.pathname === '/api/bridge/catalog' && request.method === 'POST') return catalog(request,env);
    if (url.pathname === '/api/bridge/sign' && request.method === 'POST') return sign(request,env);
    if (url.pathname === '/api/bridge/media' && request.method === 'GET') return media(request,env);
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
