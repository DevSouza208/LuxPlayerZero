/**
 * Shared TMDB matching. Internal classifier uses D1 by default.
 * Public routes inject transient storage via live-metadata.js and never touch D1.
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

export async function lookupTmdb(request, env, fetcher = fetch, clock = Date.now, store = null) {
  if (request.method !== 'POST') return fail(405, 'Método não permitido.');
  if (!sameOriginPost(request)) return fail(403, 'Origem não permitida.');
  if (typeof env?.TMDB_API_KEY !== 'string' || !env.TMDB_API_KEY.trim() ||
      (!store && typeof env?.DB?.prepare !== 'function')) {
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
    if(store){const hit=await store.get(query.key);if(hit)return apiOk(hit);}
    else {
    await ensureTables(env.DB);
    cache = await env.DB.prepare('SELECT payload, expires_at FROM tmdb_meta_cache WHERE id = ?')
      .bind(query.key).first();
    if (cache?.expires_at > now) return apiOk(JSON.parse(cache.payload));
    const previous = await env.DB.prepare('SELECT payload, expires_at FROM tmdb_meta_cache WHERE id = ?')
      .bind(query.previousKey).first();
    if(previous?.expires_at > now) {
      const saved = JSON.parse(previous.payload);
      if(saved.status === 'matched' && saved.poster) return apiOk(saved);
    }
    }
  } catch {
    // Sem D1: não há cache nem limite confiável. Bloquear consultas.
    return fail(503, 'Cache de metadados indisponível. Usando os dados originais.');
  }

  let result;
  async function remote(path, parameters = {}) {
    if(store){if(!store.take())throw Object.assign(new Error(),{name:'QuotaError'});}
    else {
    const quota = await env.DB.prepare(
      'INSERT INTO tmdb_meta_daily (day, used) VALUES (?, 1) ' +
      'ON CONFLICT(day) DO UPDATE SET used = used + 1 WHERE used < ?'
    ).bind(day, TMDB_LIMITS.dailyRemoteLookups).run();
    if (!quota?.meta?.changes) throw Object.assign(new Error(), { name: 'QuotaError' });
    }
    const url = new URL('https://api.themoviedb.org/3/' + path);
    url.searchParams.set('api_key', env.TMDB_API_KEY.trim());
    for (const [key,value] of Object.entries(parameters)) url.searchParams.set(key,value);
    const response = await fetcher(url.href, {
      method:'GET', redirect:'manual', signal:AbortSignal.timeout(7000),
      headers:{accept:'application/json','cache-control':'no-cache'}
    });
    if (!response.ok) throw Object.assign(new Error(),{name:'ProviderError'});
    return response.json();
  }
  try {
    if(query.tmdbId) result = chooseIdMatch(query,await remote(query.type+'/'+query.tmdbId,{language:'pt-BR'}));
    else {
      const withoutArticle = query.title.replace(/^(?:(?:a|o|os|as|the|an|el|la|los|las|um|uma|un|une)\s+)+/i,'').trim();
      const search = withoutArticle.length >= 3 ? withoutArticle : query.title;
      const parameters = {query:search,include_adult:'false'};
      if(query.year) parameters[query.type==='movie'?'year':'first_air_date_year']=String(query.year);
      const localized = await remote('search/'+query.type,{...parameters,language:'pt-BR'});
      const candidates = new Map();
      function merge(rows) {
        for(const row of (Array.isArray(rows)?rows:[]).slice(0,20)) {
          if(!Number.isSafeInteger(row?.id)||row.id<1||row.adult===true)continue;
          const previous=candidates.get(row.id);
          const aliases=[...(previous?.aliases||[]),row.title,row.name,row.original_title,row.original_name].filter(name=>typeof name==='string');
          candidates.set(row.id,{...row,...previous,aliases:[...new Set(aliases)]});
        }
      }
      merge(localized.results);
      result=chooseExactMatch(query,[...candidates.values()]);
      if(!result) {
        // TMDB searches localized/translated titles; English adds original names.
        const first=[...candidates.values()][0];
        const original=query.type==='movie'?first?.original_title:first?.original_name;
        const englishQuery=typeof original==='string'&&original.length>=3&&original.length<=130?original:search;
        const english=await remote('search/'+query.type,{...parameters,query:englishQuery,language:'en-US'});
        merge(english.results);
        result=chooseExactMatch(query,[...candidates.values()]);
      }
      if(!result) {
        // Verify translated aliases of at most two candidate IDs; never invent a translation.
        for(const candidate of [...candidates.values()].slice(0,2)) {
          const translated=await remote(query.type+'/'+candidate.id+'/translations');
          const aliases=(Array.isArray(translated.translations)?translated.translations:[])
            .flatMap(entry=>[entry?.data?.name,entry?.data?.title]).filter(name=>typeof name==='string');
          candidate.aliases=[...new Set([...candidate.aliases,...aliases])];
        }
        result=chooseExactMatch(query,[...candidates.values()]);
      }
    }
  } catch(error) {
    const code = error?.name === 'QuotaError' ? 'TMDB_QUOTA' : error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'TMDB_TIMEOUT' : 'TMDB_UNAVAILABLE';
    return new Response(JSON.stringify({error:'Não foi possível concluir a busca TMDB. Tente novamente.',code}),{
      status:code==='TMDB_QUOTA'?429:503,headers:{'content-type':'application/json','cache-control':'no-store'}
    });
  }

  const payload = result || { status: 'unmatched' };
  const expires = now + (result ? TMDB_LIMITS.matchTtlMs : TMDB_LIMITS.missTtlMs);
  try {
    if(store){await store.put(query.key,payload,expires);return apiOk(payload);}
    await env.DB.prepare(
      'INSERT INTO tmdb_meta_cache (id, payload, expires_at) VALUES (?, ?, ?) ' +
      'ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, expires_at = excluded.expires_at'
    ).bind(query.key, JSON.stringify(payload), expires).run();
    if(result) {
      // Reuse the same official poster for verified localized/original title aliases.
      for(const title of new Set([result.matchedTitle,result.originalTitle])) {
        const alias=validateQuery({type:query.type,title,year:query.year,tmdbId:query.tmdbId});
        if(!alias||alias.key===query.key)continue;
        await env.DB.prepare(
          'INSERT INTO tmdb_meta_cache (id, payload, expires_at) VALUES (?, ?, ?) ' +
          'ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, expires_at = excluded.expires_at'
        ).bind(alias.key,JSON.stringify({...payload,title}),expires).run();
      }
    }
  } catch {
    // O cliente ainda pode receber dados, mas a próxima consulta depende do D1.
    return fail(503, 'O cache do TMDB não pôde ser salvo.');
  }
  return apiOk(payload);
}
