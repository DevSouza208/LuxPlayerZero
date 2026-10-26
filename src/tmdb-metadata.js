/**
 * /api/metadata/tmdb — lookup opcional, privado e estritamente limitado.
 * Requer TMDB_API_KEY (Secret) + DB (D1) no Pages. Falha fechada.
 * Não manipula mídia, catálogos, playlist, R2 ou rotas /api/bridge.
 */
import { apiError, apiOk, sameOriginPost } from './bridge-core.js';
import { TMDB_LIMITS, validateQuery, chooseExactMatch, chooseIdMatch } from './tmdb-safe.js';

const MAX_BODY = 400;
const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS tmdb_meta_cache (id TEXT PRIMARY KEY, payload TEXT NOT NULL, expires_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS tmdb_meta_daily (day TEXT PRIMARY KEY, used INTEGER NOT NULL DEFAULT 0)'
];
async function ensureTables(db) {
  for (const sql of SCHEMA) await db.prepare(sql).run();
}
function fail(status, message) { return apiError(status, message); }

export async function lookupTmdb(request, env, fetcher = fetch, clock = Date.now) {
  if (request.method !== 'POST') return fail(405, 'Método não permitido.');
  if (!sameOriginPost(request)) return fail(403, 'Origem não permitida.');
  if (typeof env?.TMDB_API_KEY !== 'string' || !env.TMDB_API_KEY.trim() ||
      typeof env?.DB?.prepare !== 'function') {
    return fail(503, 'Metadados TMDB não configurados. Mantendo imagens da lista.');
  }
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY) {
    return fail(413, 'Consulta muito grande.');
  }
  let query;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return fail(413, 'Consulta muito grande.');
    query = validateQuery(JSON.parse(text));
  } catch { return fail(400, 'Consulta inválida.'); }
  if (!query) return fail(400, 'Título, ano ou tipo inválido.');

  const now = clock();
  const day = new Date(now).toISOString().slice(0, 10);
  let cache;
  try {
    await ensureTables(env.DB);
    cache = await env.DB.prepare('SELECT payload, expires_at FROM tmdb_meta_cache WHERE id = ?')
      .bind(query.key).first();
    if (cache?.expires_at > now) return apiOk(JSON.parse(cache.payload));
    const quota = await env.DB.prepare(
      'INSERT INTO tmdb_meta_daily (day, used) VALUES (?, 1) ' +
      'ON CONFLICT(day) DO UPDATE SET used = used + 1 WHERE used < ?'
    ).bind(day, TMDB_LIMITS.dailyRemoteLookups).run();
    if (!quota?.meta?.changes) {
      return fail(429, 'Limite diário de metadados atingido. Usando os dados originais.');
    }
  } catch {
    // Sem D1: não há cache nem limite confiável. Bloquear consultas.
    return fail(503, 'Cache de metadados indisponível. Usando os dados originais.');
  }

  // Um único pedido remoto por título: pesquisa normalizada OU ID explícito.
  const url = query.tmdbId
    ? new URL('https://api.themoviedb.org/3/' + query.type + '/' + query.tmdbId)
    : new URL('https://api.themoviedb.org/3/search/' + query.type);
  url.searchParams.set('api_key', env.TMDB_API_KEY.trim());
  url.searchParams.set('language', 'pt-BR');
  if (!query.tmdbId) {
    // Artigos iniciais comuns atrapalham pesquisas de títulos localizados;
    // o matcher ainda confere título/ano, então isso não cria associações cegas.
    const withoutArticle = query.title.replace(/^(?:(?:a|o|os|as|the|an|el|la|los|las|um|uma|un|une)\s+)+/i, '').trim();
    url.searchParams.set('query', withoutArticle.length >= 3 ? withoutArticle : query.title);
    url.searchParams.set('include_adult', 'false');
  }
  let result;
  try {
    const response = await fetcher(url.href, {
      method: 'GET', redirect: 'manual',
      signal: AbortSignal.timeout(7000),
      headers: { 'accept': 'application/json', 'cache-control': 'no-cache' }
    });
    if (!response.ok) return fail(503, 'TMDB indisponível no momento. Usando os dados originais.');
    const data = await response.json();
    result = query.tmdbId ? chooseIdMatch(query, data) : chooseExactMatch(query, data?.results);
  } catch (error) {
    const code = error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'TMDB_TIMEOUT' : error instanceof SyntaxError ? 'TMDB_RESPONSE' : 'TMDB_NETWORK';
    return new Response(JSON.stringify({error:'Consulta TMDB falhou. Usando os dados originais.',code}),{status:503,headers:{'content-type':'application/json','cache-control':'no-store'}});
  }

  const payload = result || { status: 'unmatched' };
  const expires = now + (result ? TMDB_LIMITS.matchTtlMs : TMDB_LIMITS.missTtlMs);
  try {
    await env.DB.prepare(
      'INSERT INTO tmdb_meta_cache (id, payload, expires_at) VALUES (?, ?, ?) ' +
      'ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, expires_at = excluded.expires_at'
    ).bind(query.key, JSON.stringify(payload), expires).run();
  } catch {
    // O cliente ainda pode receber dados, mas a próxima consulta depende do D1.
    return fail(503, 'O cache do TMDB não pôde ser salvo.');
  }
  return apiOk(payload);
}
