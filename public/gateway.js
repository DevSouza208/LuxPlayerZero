/**
 * Bridge API client — HTTPS (Pages Functions).
 * Chave jamais vai para URL ou storage. Sessão HttpOnly em /api/bridge.
 */
export function isBridgeRequired(url) {
  return typeof location !== 'undefined' && location.protocol === 'https:' &&
    /^http:\/\//i.test(String(url || '').trim());
}

export function createBridge({ getKey, onStatus = () => {} } = {}) {
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
    // Tenta cookie já existente antes de exigir a chave novamente.
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
    const key = getKey?.();
    if (!key) {
      throw new Error('Para fontes HTTP, configure a ponte no Cloudflare Pages e informe a chave do Gateway HTTPS no painel esquerdo.');
    }
    await post('connect', { key });
    connected = true;
    onStatus('Gateway HTTPS conectado com sessão segura.');
  }

  return {
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
