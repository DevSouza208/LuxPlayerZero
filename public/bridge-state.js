/** Representação de estado do gateway HTTPS na interface. Nenhum segredo aqui. */
export function describeBridge(status, needsMedia = false) {
  if (!status) return {
    kind: 'checking', showKey: false,
    message: 'Verificando se a ponte HTTPS está disponível no Cloudflare Pages...'
  };
  if (!status.configured) return {
    kind: 'unconfigured', showKey: false,
    message: 'Ponte HTTPS indisponível. Configure BRIDGE_ACCESS_KEY e BRIDGE_ALLOWED_HOSTS no Cloudflare Pages; somente depois conecte fontes HTTP.'
  };
  if (status.snapshotReady === false) return {
    kind: 'unconfigured', showKey: false,
    message: 'Conecte R2 (CATALOG_BUCKET) e D1 (DB) no Cloudflare Pages para guardar as listas HTTP.'
  };
  if (!status.connected) return {
    kind: 'needs-login', showKey: false,
    message: 'Entre na sua conta Lux ID para conectar e guardar sua biblioteca.'
  };
  if (needsMedia && !status.mediaEnabled) return {
    kind: 'catalog-only', showKey: false,
    message: 'Catálogo conectado, mas reprodução de vídeo HTTP pelo gateway está desativada. Use uma URL HTTPS oficial ou um player nativo; retransmissão exige autorização.'
  };
  return {
    kind: 'ready', showKey: false,
    message: 'Ponte HTTPS conectada. A reprodução depende do formato, da origem e das permissões do serviço.'
  };
}
