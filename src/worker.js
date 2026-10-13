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
