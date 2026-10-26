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
  if (!status.connected) return {
    kind: 'visitor', showKey: false,
    message: 'Sua lista pode ser aberta nesta sessão. Entre no Lux ID para guardar sua biblioteca.'
  };
  if (status.snapshotReady === false) return {
    kind: 'unconfigured', showKey: false,
    message: 'O armazenamento da biblioteca está indisponível. Contate o administrador.'
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
