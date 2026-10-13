/** Estado de interface da ponte HTTPS — aguardando casos de teste (TDD). */
export function describeBridge(_status, _needsMedia = false) {
  return { kind: 'pending', message: '', showKey: false };
}
