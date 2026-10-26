/**
 * Acesso privado a catálogos HTTPS (Pages Functions).
 * Chave jamais vai para URL ou storage. Sessão HttpOnly em /api/bridge.
 */
export function isBridgeRequired(url) {
  return typeof location !== 'undefined' && location.protocol === 'https:' &&
    /^http:\/\//i.test(String(url || '').trim());
}

export function createBridge({ onStatus = () => {} } = {}) {
  let connected = false;
  async function post(action, body) {
    const response = await fetch('/api/bridge/' + action, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(body),
      referrerPolicy: 'no-referrer'
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) connected = false;
      throw new Error(result.error || 'Falha no gateway HTTPS (HTTP ' + response.status + ').');
    }
    return result;
  }

  async function ensureConnected() {
    if (connected) return;
    // A sessão Lux ID é validada pelo servidor; nenhum segredo vem da interface.
    try {
      const response = await fetch('/api/bridge/status', {
        credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer'
      });
      if (response.ok) {
        const status = await response.json();
        if (status.connected) {
          connected = true;
          onStatus('Gateway HTTPS conectado.');
          return;
        }
      }
    } catch {}
    await post('connect', {});
    connected = true;
    onStatus('Gateway HTTPS conectado com sessão segura.');
  }

  return {
    async importPlaylist(url) {
      const response = await fetch('/api/bridge/import', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }), referrerPolicy: 'no-referrer'
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Não foi possível importar a playlist.');
      }
      return response.text();
    },
    // A M3U original é guardada no R2 e registrada no D1.
    // O navegador recebe o arquivo pela rota HTTPS privada.
    async snapshot(url) {
      await ensureConnected();
      const meta = await post('sync', { url });
      if (typeof meta.url !== 'string' || !meta.url.startsWith('/api/bridge/playlist?id=')) {
        throw new Error('A sincronização não retornou um endereço HTTPS válido.');
      }
      const response = await fetch(meta.url, {
        credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer'
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Não foi possível ler a lista no R2.');
      }
      return { ...meta, content: await response.text() };
    },
    async catalog(url) {
      await ensureConnected();
      const result = await post('catalog', { url });
      return result.content;
    },
    async media(url) {
      await ensureConnected();
      const result = await post('sign', { url });
      return result.url;
    },
    isConnected: () => connected
  };
}
