import {versionKey,readCatalogManifest} from './catalog-version.js';
/**
 * Lux Player Zero — sincronização simples de catálogos:
 * origem HTTP → R2 privado → referência D1 → entrega HTTPS autenticada.
 *
 * O arquivo M3U é armazenado INTACTO. Nunca baixamos filmes ou canais,
 * nem transformamos os endereços internos em supostos endereços HTTPS.
 */
import {
  apiError, apiOk, bridgeReady, permittedUrl, session,
  sameOriginPost, fetchAllowed, seal, unseal
} from './bridge-core.js';

const MAX_CATALOG_BYTES = 256 * 1024 * 1024;
const PART_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 180000;
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

const REFRESH_SCHEMA = `CREATE TABLE IF NOT EXISTS catalog_refresh_sources (
  source_hash TEXT PRIMARY KEY,
  source_cipher TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;
async function ensureSchema(env) {
  await env.DB.prepare(SQL_SCHEMA).run();
  await env.DB.prepare(REFRESH_SCHEMA).run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS catalog_refresh_locks(source_hash TEXT PRIMARY KEY,lease_until INTEGER NOT NULL)').run();
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

/**
 * Lê e grava uma M3U por partes de 8 MiB no R2, sem acumular os 256 MiB
 * na memória do Worker. Mantém o arquivo original e conta os #EXTINF.
 * Cada parte, exceto a última, atende ao mínimo de 5 MiB do R2.
 */
async function streamCatalogToR2(body, bucket, fileKey, expectedBytes = 0) {
  if (!body) throw new Error('O fornecedor devolveu uma resposta vazia.');
  const upload = await bucket.createMultipartUpload(fileKey, {
    httpMetadata: { contentType: 'audio/x-mpegurl; charset=utf-8', cacheControl: 'private, no-store' }
  });
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parts = [];
  const hashes = [];
  const hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  async function uploadPart(bytes){hashes.push(await hash(bytes));parts.push(await upload.uploadPart(parts.length+1,bytes));}
  let buffer = new Uint8Array(PART_BYTES);
  let used = 0;
  let bytes = 0;
  let itemCount = 0;
  let firstLine = false;
  let lineTail = '';

  function inspectLine(raw) {
    // URLs de mídia são a maior parte do arquivo: não executar regex nelas.
    const line = !firstLine || raw.charCodeAt(0) <= 32 ? raw.trim() : raw;
    if (!line) return;
    if (!firstLine) {
      firstLine = true;
      if (line.replace(/^\uFEFF/, '') !== '#EXTM3U') {
        throw new Error(/^\s*(?:<!doctype html|<html|<\?xml)/i.test(line)
          ? 'O fornecedor devolveu uma página HTML/XML, não uma playlist M3U.'
          : 'O fornecedor respondeu, mas o conteúdo não é uma playlist M3U válida.');
      }
    }
    if (line.charCodeAt(0) !== 35) return;
    if (line.startsWith('#EXTINF:')) itemCount++;
    if (line.startsWith('#EXT-X-') && /^#EXT-X-(?:TARGETDURATION|STREAM-INF|MEDIA-SEQUENCE)/i.test(line)) {
      throw new Error('O fornecedor devolveu um stream HLS, não um catálogo M3U.');
    }
  }
  function inspectText(text) {
    let start = 0;
    let index;
    while ((index = text.indexOf('\n', start)) >= 0) {
      inspectLine(lineTail + text.slice(start, index));
      lineTail = '';
      start = index + 1;
    }
    lineTail += text.slice(start);
    if (lineTail.length > 128 * 1024) {
      throw new Error('A playlist contém uma linha longa demais para processamento seguro.');
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_CATALOG_BYTES) {
        throw new Error('A playlist ultrapassa o limite de 256 MB.');
      }
      inspectText(decoder.decode(value, { stream: true }));
      let offset = 0;
      while (offset < value.byteLength) {
        const take = Math.min(PART_BYTES - used, value.byteLength - offset);
        buffer.set(value.subarray(offset, offset + take), used);
        used += take;
        offset += take;
        if (used === PART_BYTES) {
          await uploadPart(buffer);
          buffer = new Uint8Array(PART_BYTES);
          used = 0;
        }
      }
    }
    if (expectedBytes > 0 && bytes !== expectedBytes) throw new Error('O fornecedor devolveu um download incompleto. Tente atualizar a lista novamente.');
    inspectText(decoder.decode());
    if (lineTail) inspectLine(lineTail);
    if (!firstLine || itemCount === 0) {
      throw new Error('O fornecedor respondeu, mas o conteúdo não é uma playlist M3U válida.');
    }
    if (used) await uploadPart(buffer.subarray(0, used));
    await upload.complete(parts);
    return { itemCount, bytes, contentVersion:await hash(ENCODER.encode(hashes.join(':'))) };
  } catch (error) {
    try { await upload.abort(); } catch {}
    throw error;
  } finally {
    try { await reader.cancel(); } catch {}
  }
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
  try {
    if (!await session(request, env)) return apiError(401, 'Entre na sua conta Lux ID para conectar sua biblioteca.');
  } catch { return apiError(503, 'Não foi possível verificar a sessão no D1. Entre novamente e tente conectar a lista.'); }
  if (Number(request.headers.get('content-length') || 0) > 8192) {
    return apiError(413, 'Endereço enviado é grande demais.');
  }

  let source;
  let requireFresh = false;
  try {
    const body = await request.json();
    source = permittedUrl(body?.url, env).href;
    requireFresh = body?.requireFresh === true;
  } catch {
    return apiError(400, 'Endereço inválido ou servidor não autorizado.');
  }

  return refreshCatalogSource(source, env, fetcher, {requireFresh});
}

/** Caminho único para importação manual e cron: arquivo intacto, entrega estável. */
export async function refreshCatalogSource(rawSource,env,fetcher=fetch,options={}){
  if(!snapshotReady(env))return apiError(503,'Armazenamento da biblioteca indisponível.');
  let hash,lease;
  try{
    const source=permittedUrl(rawSource,env).href;hash=await sourceHash(source,env);lease=Date.now()+900000;
    await ensureSchema(env);
    const locked=await env.DB.prepare('INSERT INTO catalog_refresh_locks(source_hash,lease_until) VALUES (?,?) ON CONFLICT(source_hash) DO UPDATE SET lease_until=excluded.lease_until WHERE catalog_refresh_locks.lease_until<=?').bind(hash,lease,Date.now()).run();
    if(!locked.meta.changes)return apiError(409,'Esta lista já está sendo atualizada. Tente novamente mais tarde.');
  }catch{return apiError(503,'Não foi possível iniciar a atualização da biblioteca.');}
  try{return await refreshCatalogSourceUnlocked(rawSource,env,fetcher,options);}
  finally{try{await env.DB.prepare('DELETE FROM catalog_refresh_locks WHERE source_hash=? AND lease_until=?').bind(hash,lease).run();}catch{}}
}
async function refreshCatalogSourceUnlocked(rawSource, env, fetcher = fetch, {requireFresh = true} = {}) {
  if (!snapshotReady(env)) return apiError(503, 'Armazenamento da biblioteca indisponível.');
  let source;
  try { source = permittedUrl(rawSource, env).href; }
  catch { return apiError(400, 'Origem não autorizada.'); }
  let sourceId;
  let old;
  try {
    sourceId = await sourceHash(source, env);
    await ensureSchema(env);
    old = await previousFor(env, sourceId);
  } catch {
    return apiError(503, 'Não foi possível acessar a tabela do catálogo no D1.');
  }

  // Recebe o catálogo completo em partes e grava direto no R2 privado.
  // Nenhum vídeo é baixado; apenas o índice M3U original.
  const id = old?.catalog_id || crypto.randomUUID();
  const fileKey = 'catalogos/' + id + '/' + crypto.randomUUID() + '.m3u';
  let imported;
  try {
    const { response } = await fetchAllowed(
      source, env, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }, fetcher
    );
    if (!response.ok) {
      throw new Error('O servidor do fornecedor respondeu HTTP ' + response.status + ' ao solicitar a playlist.');
    }
    if (Number(response.headers.get('content-length') || 0) > MAX_CATALOG_BYTES) {
      throw new Error('A playlist ultrapassa o limite de 256 MB.');
    }
    const expectedBytes = !response.headers.get('content-encoding') ? Number(response.headers.get('content-length') || 0) : 0;
    imported = await streamCatalogToR2(response.body, env.CATALOG_BUCKET, fileKey, expectedBytes);
  } catch (error) {
    const cached = requireFresh ? null : await latestAvailable(env, old);
    if (cached) return cached;
    const message = String(error?.message || '');
    if (/ultrapassa o limite de 256 MB/.test(message)) {
      return apiError(413, 'A playlist ultrapassa o limite de 256 MB.');
    }
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      return apiError(504, 'O fornecedor demorou mais de 180 segundos para entregar a playlist.');
    }
    if (/Host não liberado|Host não permitido/i.test(message)) {
      return apiError(502, 'A origem redirecionou para um host não autorizado na Cloudflare.');
    }
    if (/^O servidor do fornecedor respondeu HTTP \d{3}/.test(message) ||
        /^O fornecedor (devolveu|respondeu)/.test(message) ||
        /^A playlist contém uma linha/.test(message)) {
      return apiError(502, message);
    }
    return apiError(502, 'Não foi possível importar a playlist completa. Confira a origem e a disponibilidade do R2.');
  }
  let previousManifest;
  try{previousManifest=await readCatalogManifest(env,id);}catch{}
  if(old&&old.r2_key===previousManifest?.fileKey&&previousManifest?.contentVersion===imported.contentVersion){
    await env.CATALOG_BUCKET.delete(fileKey).catch(()=>{});
    return apiOk({...savedResult(old,true),contentVersion:imported.contentVersion});
  }
  const row = {
    catalog_id: id,
    r2_key: fileKey,
    synced_at: new Date().toISOString(),
    item_count: imported.itemCount,
    size_bytes: imported.bytes
  };

  try {
    // Guarda a origem cifrada, nunca a senha do fornecedor em texto aberto no D1.
    const cipher = await seal({scope:'catalog-source',url:source,exp:253402300799000}, env);
    await env.DB.prepare(`INSERT INTO catalog_refresh_sources(source_hash,source_cipher,updated_at)
      VALUES (?,?,?) ON CONFLICT(source_hash) DO UPDATE SET
      source_cipher=excluded.source_cipher,updated_at=excluded.updated_at`)
      .bind(sourceId,cipher,row.synced_at).run();
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

  // Publish the small version manifest last. Old data survives a failed publication.
  try{await env.CATALOG_BUCKET.put(versionKey(id),JSON.stringify({schemaVersion:1,catalogId:id,contentVersion:imported.contentVersion,generatedAt:row.synced_at,itemCount:row.item_count,bytes:row.size_bytes,fileKey}),{httpMetadata:{contentType:'application/json',cacheControl:'private, no-store'}});}
  catch{return apiError(503,'A versão do catálogo não pôde ser publicada. A cópia anterior foi preservada.');}
  // Evita acumular snapshots antigos quando a mesma origem é sincronizada.
  for(const obsolete of new Set([old?.r2_key,previousManifest?.fileKey]))if(obsolete&&obsolete!==fileKey){
    try { await env.CATALOG_BUCKET.delete(obsolete); } catch {}
  }

  return apiOk({...savedResult(row),contentVersion:imported.contentVersion});
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
    const manifest=await readCatalogManifest(env,id);
    if(manifest){
      const expected=new URL(request.url).searchParams.get('version');
      if(expected&&expected!==manifest.contentVersion)return apiError(409,'O catálogo mudou durante o download. Tente novamente.');
      const file=await env.CATALOG_BUCKET.get(manifest.fileKey);
      if(!file?.body)return apiError(503,'A nova cópia do catálogo não está disponível.');
      return new Response(file.body,{headers:{'content-type':'audio/x-mpegurl; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-length':String(manifest.bytes),'x-lux-catalog-version':manifest.contentVersion}});
    }
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

/** Atualização diária com as mesmas regras de download e substituição da importação. */
export async function refreshDailyCatalogs(env, fetcher = fetch, {catalogId=null}={}) {
  if (!snapshotReady(env)) throw new Error('Configure DB, CATALOG_BUCKET e os segredos do catálogo no Worker.');
  await ensureSchema(env);
  const query=catalogId?env.DB.prepare('SELECT r.source_hash,r.source_cipher FROM catalog_refresh_sources r JOIN catalog_sources c ON c.source_hash=r.source_hash WHERE c.catalog_id=?').bind(catalogId):env.DB.prepare('SELECT source_hash,source_cipher FROM catalog_refresh_sources');
  const {results=[]} = await query.all();
  const result={updated:0,failed:0};
  for(const row of results){
    try {
      const source=await unseal(row.source_cipher,env);
      if(source.scope!=='catalog-source')throw new Error('Origem inválida.');
      const response=await refreshCatalogSource(source.url,env,fetcher);
      if(!response.ok)throw new Error('Download indisponível.');
      result.updated++;
    } catch { result.failed++; }
  }
  return result;
}
