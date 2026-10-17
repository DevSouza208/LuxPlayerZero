/* Lux Player Zero — Worker mínimo com cron. Não retransmite mídia. */
import { syncCatalog } from './catalog-snapshot.js';
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
  async scheduled(controller, env, ctx) {
    if (!env.LUX_STARTER_M3U_URL || !env.DB || !env.CATALOG_BUCKET || !env.BRIDGE_ACCESS_KEY) {
      console.error('Lux catalog cron: bindings/secrets ausentes');
      return;
    }
    ctx.waitUntil(syncCatalog(new Request('https://internal.lux/api/bridge/sync', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({url:env.LUX_STARTER_M3U_URL})
    }),env,fetch,true).then(response=>{
      if(!response.ok)console.error('Lux catalog cron retornou erro HTTP',response.status);
    }).catch(error=>console.error('Lux catalog cron falhou:',String(error?.message||error))));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
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
