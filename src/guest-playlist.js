import { apiError, bridgeReady, sameOriginPost, permittedUrl, fetchAllowed, readLimited } from './bridge-core.js';
const MAX_BYTES = 256 * 1024 * 1024;
// Only imports the visitor's submitted playlist from an admin-allowed origin.
// No bridge cookie, snapshot ID, D1 query, R2 access or media proxy is granted.
export async function importGuestPlaylist(request, env, fetcher = fetch) {
  if (request.method !== 'POST') return apiError(405, 'Método não permitido.');
  if (!sameOriginPost(request)) return apiError(403, 'Origem não autorizada.');
  if (!bridgeReady(env)) return apiError(503, 'A conexão de listas está indisponível. Contate o administrador.');
  if (!request.headers.get('content-type')?.startsWith('application/json')) return apiError(415, 'Envie JSON.');
  let url;
  try {
    const text = await readLimited(request.body, 8192);
    url = permittedUrl(JSON.parse(text).url, env).href;
  } catch { return apiError(400, 'Confira a URL e o servidor autorizado para a lista.'); }
  try {
    const { response } = await fetchAllowed(url, env, { signal: AbortSignal.timeout(180000) }, fetcher);
    if (!response.ok) { await response.body?.cancel(); return apiError(502, 'O provedor não entregou a playlist.'); }
    if (Number(response.headers.get('content-length') || 0) > MAX_BYTES) {
      await response.body?.cancel(); return apiError(413, 'A lista ultrapassa 256 MB.');
    }
    if (!response.body) return apiError(502, 'O provedor entregou uma resposta vazia.');
    // Stream without accumulating a 256 MB catalog in Worker memory.
    const reader = response.body.getReader();
    const prefix = []; let prefixBytes = 0;
    while (prefixBytes < 512) {
      const { value, done } = await reader.read();
      if (done) break;
      prefix.push(value); prefixBytes += value.byteLength;
      if (new TextDecoder().decode(value).includes('\n')) break;
    }
    const head = new Uint8Array(prefixBytes); let offset = 0;
    for (const chunk of prefix) { head.set(chunk, offset); offset += chunk.byteLength; }
    if (prefixBytes > MAX_BYTES || !/^\s*#EXTM3U(?:\s|$)/i.test(new TextDecoder().decode(head))) {
      await reader.cancel(); return apiError(502, 'O provedor não retornou uma playlist M3U válida.');
    }
    let total = prefixBytes, sentHead = false;
    const body = new ReadableStream({
      async pull(controller) {
        try {
          if (!sentHead) { sentHead = true; controller.enqueue(head); return; }
          const { value, done } = await reader.read();
          if (done) { controller.close(); return; }
          total += value.byteLength;
          if (total > MAX_BYTES) { await reader.cancel(); controller.error(new Error('A lista ultrapassa 256 MB.')); return; }
          controller.enqueue(value);
        } catch { await reader.cancel().catch(() => {}); controller.error(new Error('Não foi possível concluir a importação da lista.')); }
      },
      cancel(reason) { return reader.cancel(reason); }
    });
    return new Response(body, { headers: {
      'content-type': 'audio/x-mpegurl; charset=utf-8', 'cache-control': 'no-store',
      'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer'
    } });
  } catch { return apiError(502, 'Não foi possível importar a playlist. Confira a fonte e tente novamente.'); }
}
