/**
 * Lux Zero — ponte HTTPS para fontes HTTP autorizadas.
 * Nunca funciona como proxy público: exige segredo forte + cookie HttpOnly
 * + lista explícita de hosts permitidos. Não armazena catálogo/vídeo.
 */
const MAX_CATALOG_BYTES = 20 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const SESSION_MS = 8 * 60 * 60 * 1000;
const MEDIA_TOKEN_MS = 8 * 60 * 60 * 1000;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const apiError = (status, message) => new Response(JSON.stringify({ error: message }), {
  status, headers: { 'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' }
});
export const apiOk = data => new Response(JSON.stringify(data), {
  headers: { 'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' }
});

export function bridgeReady(env) {
  return typeof env?.BRIDGE_ACCESS_KEY === 'string' &&
    env.BRIDGE_ACCESS_KEY.length >= 24 &&
    typeof env?.BRIDGE_ALLOWED_HOSTS === 'string' &&
    env.BRIDGE_ALLOWED_HOSTS.trim().length > 0;
}
export const mediaReady = env => bridgeReady(env) && env.BRIDGE_MEDIA_ENABLED === 'true';

export function permittedUrl(value, env) {
  if (!bridgeReady(env)) throw new Error('O gateway privado não foi configurado.');
  if (typeof value !== 'string' || value.length > 4096) throw new Error('URL inválida.');
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('URL inválida.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) {
    throw new Error('Apenas origens HTTP(S) sem credenciais na autoridade são permitidas.');
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (!/^[a-z0-9.-]+$/.test(hostname) || hostname === 'localhost' ||
    hostname.endsWith('.localhost') || hostname.endsWith('.local') ||
    /^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes('..') ||
    hostname.startsWith('.') || hostname.endsWith('.')) {
    throw new Error('Host não permitido para a ponte HTTPS.');
  }
  const allowed = env.BRIDGE_ALLOWED_HOSTS.split(/[,\s]+/).map(s => s.toLowerCase().trim()).filter(Boolean);
  // Somente host exato ou host:porta explícito (nunca wildcard ou sufixo).
  const hostnamePort = parsed.host.toLowerCase().replace(/\.$/, '');
  // URL normaliza :80 em http:// e :443 em https://, embora ambos sejam
  // equivalentes quando declarados explicitamente na allowlist.
  const effectivePort = parsed.port || (parsed.protocol === 'http:' ? '80' : '443');
  const explicitPort = hostname + ':' + effectivePort;
  if (!allowed.includes(hostnamePort) && !allowed.includes(explicitPort)) {
    throw new Error('Host não liberado pelo administrador do gateway.');
  }
  return parsed;
}

function parseCookies(request) {
  const raw = request.headers.get('cookie') || '';
  for (const piece of raw.split(';')) {
    const [name, ...parts] = piece.trim().split('=');
    if (name === 'lux_zero_bridge') return parts.join('=');
  }
  return '';
}
function toBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(value) {
  if (typeof value !== 'string' || value.length > 12000 || !/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error('Token inválido.');
  const str = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(str, ch => ch.charCodeAt(0));
}
async function keyFor(env) {
  const hash = await crypto.subtle.digest('SHA-256', textEncoder.encode(env.BRIDGE_ACCESS_KEY));
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function seal(data, env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = textEncoder.encode(JSON.stringify(data));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFor(env), payload));
  const out = new Uint8Array(iv.length + ciphertext.length);
  out.set(iv); out.set(ciphertext, iv.length);
  return toBase64Url(out);
}
export async function unseal(value, env) {
  try {
    const bytes = fromBase64Url(value);
    if (bytes.length < 29) throw new Error('Token inválido.');
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) },
      await keyFor(env), bytes.slice(12));
    const data = JSON.parse(textDecoder.decode(plain));
    if (!data || !Number.isFinite(data.exp) || data.exp < Date.now()) throw new Error('Token expirado.');
    return data;
  } catch { throw new Error('Sessão inválida ou expirada. Reconecte o gateway.'); }
}
function equalConstantTime(a, b) {
  const left = textEncoder.encode(String(a || ''));
  const right = textEncoder.encode(String(b || ''));
  let mismatch = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    mismatch |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return mismatch === 0;
}
export function sameOriginPost(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  try { return origin === new URL(request.url).origin; }
  catch { return false; }
}
export async function session(request, env) {
  if (!bridgeReady(env)) return false;
  const token = parseCookies(request);
  if (!token) return false;
  try {
    const data = await unseal(token, env);
    return data.scope === 'bridge-session';
  } catch { return false; }
}
export async function connect(request, env) {
  if (!bridgeReady(env)) return apiError(503, 'Gateway ainda não configurado. Defina BRIDGE_ACCESS_KEY e BRIDGE_ALLOWED_HOSTS no Cloudflare Pages.');
  if (!sameOriginPost(request)) return apiError(403, 'Origem da solicitação não permitida.');
  let supplied;
  try {
    if (Number(request.headers.get('content-length')) > 2048) return apiError(413, 'Solicitação grande demais.');
    const input = await request.json();
    supplied = input.key;
  } catch { return apiError(400, 'Solicitação inválida.'); }
  if (!equalConstantTime(supplied, env.BRIDGE_ACCESS_KEY)) return apiError(403, 'Chave do gateway inválida.');
  const token = await seal({ scope: 'bridge-session', exp: Date.now() + SESSION_MS }, env);
  const response = apiOk({ connected: true, mediaEnabled: mediaReady(env) });
  response.headers.set('set-cookie', 'lux_zero_bridge=' + token +
    '; HttpOnly; Secure; SameSite=Strict; Path=/api/bridge; Max-Age=' + SESSION_MS / 1000);
  return response;
}
export async function status(request, env) {
  return apiOk({
    configured: bridgeReady(env),
    connected: await session(request, env),
    mediaEnabled: mediaReady(env)
  });
}

export async function fetchAllowed(rawUrl, env, options = {}, fetcher = fetch) {
  let url = permittedUrl(rawUrl, env);
  for (let hop = 0; hop < 4; hop++) {
    // Todos os redirecionamentos são revalidados; nenhum header sensível é repassado.
    const response = await fetcher(url.href, {
      method: 'GET', redirect: 'manual', cache: 'no-store',
      headers: options.range ? { Range: options.range } : {},
      signal: options.signal
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirecionamento sem destino.');
      const next = new URL(location, url);
      url = permittedUrl(next.href, env);
      try { await response.body?.cancel(); } catch {}
      continue;
    }
    return { response, url };
  }
  throw new Error('Redirecionamentos demais.');
}

export async function readLimited(body, maxBytes) {
  if (!body) throw new Error('Resposta vazia.');
  const reader = body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maxBytes) throw new Error('O conteúdo excede o limite de tamanho.');
      chunks.push(result.value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return textDecoder.decode(bytes);
}
export async function catalog(request, env, fetcher = fetch) {
  if (!bridgeReady(env)) return apiError(503, 'Gateway privado ainda não configurado na Cloudflare.');
  if (!sameOriginPost(request)) return apiError(403, 'Origem da solicitação não permitida.');
  if (!await session(request, env)) return apiError(401, 'Conecte a chave do gateway.');
  let rawUrl;
  try {
    const body = await request.json();
    rawUrl = permittedUrl(body.url, env).href;
  } catch { return apiError(400, 'URL inválida ou host não autorizado.'); }
  try {
    const { response } = await fetchAllowed(rawUrl, env, { signal: AbortSignal.timeout(20000) }, fetcher);
    if (!response.ok) return apiError(502, 'Servidor de origem retornou HTTP ' + response.status + '.');
    const size = Number(response.headers.get('content-length') || '0');
    if (size > MAX_CATALOG_BYTES) return apiError(413, 'Catálogo maior que 20 MB.');
    const text = await readLimited(response.body, MAX_CATALOG_BYTES);
    return apiOk({ content: text });
  } catch (error) {
    return apiError(502, /excede/.test(error.message) ? error.message : 'O gateway não conseguiu carregar o catálogo. Verifique o servidor e os hosts permitidos.');
  }
}
export async function sign(request, env) {
  if (!mediaReady(env)) return apiError(503,
    'Reprodução pelo gateway desativada. Ative BRIDGE_MEDIA_ENABLED somente para origens autorizadas e após avaliar os termos da Cloudflare.');
  if (!sameOriginPost(request)) return apiError(403, 'Origem da solicitação não permitida.');
  if (!await session(request, env)) return apiError(401, 'Conecte a chave do gateway.');
  let url;
  try { url = permittedUrl((await request.json()).url, env).href; }
  catch { return apiError(400, 'URL de mídia não autorizada.'); }
  const token = await seal({ scope: 'bridge-media', url, exp: Date.now() + MEDIA_TOKEN_MS }, env);
  return apiOk({ url: '/api/bridge/media?token=' + encodeURIComponent(token) });
}
export async function rewriteHls(manifest, base, env) {
  const lines = manifest.split(/\r?\n/);
  const output = [];
  for (let line of lines) {
    if (line && !line.trim().startsWith('#')) {
      const absolute = new URL(line.trim(), base).href;
      const validated = permittedUrl(absolute, env);
      const token = await seal({ scope: 'bridge-media', url: validated.href, exp: Date.now() + MEDIA_TOKEN_MS }, env);
      output.push('/api/bridge/media?token=' + encodeURIComponent(token));
    } else if (/^#EXT-X-[A-Z-]+:/.test(line) && /URI="[^"]+"/.test(line)) {
      // Endereços internos: playlists variantes, init segments, legendas e chaves HLS.
      const matches = [...line.matchAll(/URI="([^"]+)"/g)];
      for (const match of matches) {
        const full = new URL(match[1], base).href;
        const validated = permittedUrl(full, env);
        const token = await seal({ scope: 'bridge-media', url: validated.href, exp: Date.now() + MEDIA_TOKEN_MS }, env);
        line = line.replace('URI="' + match[1] + '"', 'URI="/api/bridge/media?token=' + encodeURIComponent(token) + '"');
      }
      output.push(line);
    } else output.push(line);
  }
  return output.join('\n');
}
export async function media(request, env, fetcher = fetch) {
  if (!mediaReady(env)) return apiError(503, 'A reprodução HTTPS do gateway está desativada.');
  if (!await session(request, env)) return apiError(401, 'Sessão do gateway expirada.');
  let url;
  try {
    const token = new URL(request.url).searchParams.get('token');
    const data = await unseal(token, env);
    if (data.scope !== 'bridge-media') throw new Error('Escopo inválido.');
    url = permittedUrl(data.url, env).href;
  } catch { return apiError(403, 'Link de mídia inválido ou expirado. Reconecte a fonte.'); }
  const range = request.headers.get('range');
  if (range && !/^bytes=\d*-\d*$/.test(range)) return apiError(416, 'Intervalo de bytes inválido.');
  try {
    // Timeout apenas até receber cabeçalhos. Manter AbortSignal.timeout ativo
    // cortaria um MPEG-TS ao vivo mesmo enquanto o vídeo estivesse fluindo.
    const controller = new AbortController();
    const connectionTimer = setTimeout(() => controller.abort(), 20000);
    let upstream;
    try {
      upstream = await fetchAllowed(url, env, { signal: controller.signal, range }, fetcher);
    } finally {
      clearTimeout(connectionTimer);
    }
    const { response, url: effective } = upstream;
    if (!response.ok) return apiError(502, 'A origem recusou a mídia (HTTP ' + response.status + ').');
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const isHls = /\.m3u8?(?:$)/i.test(effective.pathname) ||
      /mpegurl|vnd\.apple\.mpegurl/i.test(contentType);
    if (isHls) {
      if (Number(response.headers.get('content-length') || '0') > MAX_MANIFEST_BYTES) return apiError(413, 'Manifesto grande demais.');
      const manifest = await readLimited(response.body, MAX_MANIFEST_BYTES);
      if (!manifest.trimStart().startsWith('#EXTM3U')) return apiError(502, 'Manifesto HLS inválido.');
      const rewritten = await rewriteHls(manifest, effective.href, env);
      return new Response(rewritten, { headers: {
        'content-type': 'application/vnd.apple.mpegurl; charset=utf-8',
        'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer'
      } });
    }
    const headers = new Headers({
      'content-type': contentType,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer'
    });
    if (response.headers.has('content-range')) headers.set('content-range', response.headers.get('content-range'));
    if (response.headers.has('accept-ranges')) headers.set('accept-ranges', response.headers.get('accept-ranges'));
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return apiError(502, 'Não foi possível receber os dados do stream na ponte HTTPS.');
  }
}
