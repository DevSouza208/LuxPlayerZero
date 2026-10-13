import { normalizeXtreamBase } from './playlist.js';

/** Tenta HTTPS com o mesmo caminho, query e porta da origem.
 *  Para HTTP padrão :80, a URL vira HTTPS na porta 443.
 *  Não modifica os endereços guardados na M3U.
 */
export function preferHttps(input) {
  const url = new URL(String(input || '').trim());
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Endereço precisa começar com HTTP ou HTTPS.');
  }
  if (url.protocol === 'http:') url.protocol = 'https:';
  return url.href;
}

/** Xtream como no Original: solicitar M3U completa, sem recriar cada canal. */
export function xtreamM3uUrl(base, username, password) {
  const url = new URL(normalizeXtreamBase(base) + '/get.php');
  if (!username || !password) throw new Error('Informe usuário e senha da fonte.');
  url.searchParams.set('username', username);
  url.searchParams.set('password', password);
  url.searchParams.set('type', 'm3u_plus');
  url.searchParams.set('output', 'mpegts');
  return url.href;
}
