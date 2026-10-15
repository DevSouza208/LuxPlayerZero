/**
 * Lux Player Zero — sincronização simples de catálogos:
 * origem HTTP → R2 privado → referência D1 → entrega HTTPS autenticada.
 *
 * O arquivo M3U é armazenado INTACTO. Nunca baixamos filmes ou canais,
 * nem transformamos os endereços internos em supostos endereços HTTPS.
 */
import {
  apiError, apiOk, bridgeReady, permittedUrl, session,
  sameOriginPost, fetchAllowed, readLimited
} from './bridge-core.js';

const MAX_CATALOG_BYTES = 20 * 1024 * 1024;
const ENCODER = new TextEncoder();

export function snapshotReady(env) {
  return bridgeReady(env) &&
    typeof env?.DB?.prepare === 'function' &&
    typeof env?.CATALOG_BUCKET?.put === 'function' &&
    typeof env?.CATALOG_BUCKET?.get === 'function';
}

const SQL_SCHEMA = `CREATE TABLE IF NOT EXISTS catalog_sources (
  source_hash TEXT PRIMARY KEY,
  catalog_id TEXT NOT NULL UNIQUE,
  r2_key TEXT NOT NULL,
  synced_at TEXT NOT NULL,
  item_count INTEGER NOT NULL,
  size_bytes INTEGER NOT NULL
)`;

async function ensureSchema(env) {
  await env.DB.prepare(SQL_SCHEMA).run();
}

async function sourceHash(url, env) {
  const key = await crypto.subtle.importKey(
    'raw', ENCODER.encode(env.BRIDGE_ACCESS_KEY),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, ENCODER.encode(url)));
  return [...mac].map(value => value.toString(16).padStart(2, '0')).join('');
}

function catalogLocation(catalogId) {
  return '/api/bridge/playlist?id=' + catalogId;
}

function savedResult(row, cached = false) {
  return {
    url: catalogLocation(row.catalog_id),
    catalogId: row.catalog_id,
    itemCount: row.item_count,
    bytes: row.size_bytes,
    syncedAt: row.synced_at,
    cached
  };
}

function isM3u(text) {
  const clean = String(text || '').replace(/^\uFEFF/, '').trimStart();
  return clean.startsWith('#EXTM3U') &&
    /(?:^|\n)\s*#EXTINF:/m.test(clean) &&
    !/(?:^|\n)\s*#EXT-X-(?:TARGETDURATION|STREAM-INF|MEDIA-SEQUENCE)/mi.test(clean);
}

function catalogSize(text) {
  return ENCODER.encode(text).byteLength;
}

async function previousFor(env, hash) {
  return env.DB.prepare(
    'SELECT catalog_id, r2_key, synced_at, item_count, size_bytes FROM catalog_sources WHERE source_hash = ?'
  ).bind(hash).first();
}

async function latestAvailable(env, previous) {
  if (!previous) return null;
  try {
    const existing = await env.CATALOG_BUCKET.get(previous.r2_key);
    if (existing) return apiOk(savedResult(previous, true));
  } catch {}
  return null;
}

export async function syncCatalog(request, env, fetcher = fetch) {
  if (!snapshotReady(env)) {
    return apiError(503, 'Sincronização indisponível: configure R2 (CATALOG_BUCKET), D1 (DB) e a chave do catálogo na Cloudflare.');
  }
  if (!sameOriginPost(request)) return apiError(403, 'Solicitação de outro site bloqueada.');
  if (!await session(request, env)) return apiError(401, 'Informe a chave privada do catálogo para conectar.');
  if (Number(request.headers.get('content-length') || 0) > 8192) {
    return apiError(413, 'Endereço enviado é grande demais.');
  }

  let source;
  try {
    const body = await request.json();
    source = permittedUrl(body?.url, env).href;
  } catch {
    return apiError(400, 'Endereço inválido ou servidor não autorizado.');
  }

  let sourceId;
  let old;
  try {
    sourceId = await sourceHash(source, env);
    await ensureSchema(env);
    old = await previousFor(env, sourceId);
  } catch {
    return apiError(503, 'Não foi possível acessar a tabela do catálogo no D1.');
  }

  // Baixa a resposta COMPLETA do get.php: todos os registros de TV,
  // filmes e séries que o fornecedor incluir na M3U, sem baixar vídeos.
  // Nunca expor URLs com credenciais ou o corpo de erro do fornecedor.
  let content;
  let failureStatus = 502;
  try {
    const { response } = await fetchAllowed(
      source, env, { signal: AbortSignal.timeout(25000) }, fetcher
    );
    if (!response.ok) {
      throw new Error('O servidor do fornecedor respondeu HTTP ' + response.status + ' ao solicitar a playlist.');
    }
    if (Number(response.headers.get('content-length') || 0) > MAX_CATALOG_BYTES) {
      failureStatus = 413;
      throw new Error('A playlist ultrapassa o limite atual de 20 MB.');
    }
    content = await readLimited(response.body, MAX_CATALOG_BYTES);
    if (!isM3u(content)) {
      throw new Error(/^\s*(?:<!doctype html|<html|<\?xml)/i.test(content)
        ? 'O fornecedor devolveu uma página HTML/XML, não uma playlist M3U. Verifique o formato da URL e o acesso.'
        : 'O fornecedor respondeu, mas o conteúdo não é uma playlist M3U válida.');
    }
  } catch (error) {
    const cached = await latestAvailable(env, old);
    if (cached) return cached;
    const message = String(error?.message || '');
    if (/excede o limite de tamanho|ultrapassa o limite/i.test(message)) {
      return apiError(413, 'A playlist ultrapassa o limite atual de 20 MB. Precisamos aumentar a capacidade de importação.');
    }
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      return apiError(504, 'O fornecedor demorou mais de 25 segundos para entregar a playlist.');
    }
    if (/Host não liberado|Host não permitido/i.test(message)) {
      return apiError(502, 'A origem redirecionou para um host não autorizado na Cloudflare.');
    }
    if (/^O servidor do fornecedor respondeu HTTP \d{3}/.test(message) ||
        /^O fornecedor (devolveu|respondeu)/.test(message)) {
      return apiError(failureStatus, message);
    }
    return apiError(502, 'A Cloudflare não conseguiu receber a playlist do fornecedor. Pode ser bloqueio da origem ou falha de conexão.');
  }

  const id = old?.catalog_id || crypto.randomUUID();
  const fileKey = 'catalogos/' + id + '/' + crypto.randomUUID() + '.m3u';
  const row = {
    catalog_id: id,
    r2_key: fileKey,
    synced_at: new Date().toISOString(),
    item_count: (content.match(/(?:^|\n)\s*#EXTINF:/g) || []).length,
    size_bytes: catalogSize(content)
  };

  try {
    await env.CATALOG_BUCKET.put(fileKey, content, {
      httpMetadata: {
        contentType: 'audio/x-mpegurl; charset=utf-8',
        cacheControl: 'private, no-store'
      }
    });
  } catch {
    return apiError(502, 'Não foi possível guardar a playlist no R2.');
  }

  try {
    await env.DB.prepare(
      `INSERT INTO catalog_sources (source_hash, catalog_id, r2_key, synced_at, item_count, size_bytes)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(source_hash) DO UPDATE SET
         r2_key=excluded.r2_key,
         synced_at=excluded.synced_at,
         item_count=excluded.item_count,
         size_bytes=excluded.size_bytes`
    ).bind(
      sourceId, row.catalog_id, row.r2_key,
      row.synced_at, row.item_count, row.size_bytes
    ).run();
  } catch {
    await env.CATALOG_BUCKET.delete(fileKey).catch(() => {});
    return apiError(502, 'A playlist foi recebida, mas o D1 não conseguiu registrar a referência.');
  }

  // Evita acumular snapshots antigos quando a mesma origem é sincronizada.
  if (old?.r2_key && old.r2_key !== fileKey) {
    try { await env.CATALOG_BUCKET.delete(old.r2_key); } catch {}
  }

  return apiOk(savedResult(row));
}

export async function serveCatalog(request, env) {
  if (!snapshotReady(env)) return apiError(503, 'Catálogo não configurado no R2 e D1.');
  if (!await session(request, env)) return apiError(401, 'Sessão necessária para ler a playlist.');
  const id = new URL(request.url).searchParams.get('id');
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id || '')) {
    return apiError(400, 'Identificador da playlist inválido.');
  }

  let row;
  try {
    await ensureSchema(env);
    row = await env.DB.prepare(
      'SELECT r2_key, size_bytes FROM catalog_sources WHERE catalog_id = ?'
    ).bind(id).first();
  } catch {
    return apiError(503, 'O D1 não respondeu.');
  }
  if (!row) return apiError(404, 'Playlist não encontrada.');
  try {
    const file = await env.CATALOG_BUCKET.get(row.r2_key);
    if (!file?.body) return apiError(404, 'Arquivo não encontrado no R2.');
    return new Response(file.body, {
      headers: {
        'content-type': 'audio/x-mpegurl; charset=utf-8',
        'cache-control': 'private, no-store',
        'content-disposition': 'inline',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer'
      }
    });
  } catch {
    return apiError(502, 'Não foi possível ler a playlist no R2.');
  }
}
