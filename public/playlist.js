const AUDIO_SUFFIX = /\.(mp3|aac|ogg|opus|m4a|flac|wav)(?:$|[?#])/i;

export function isHttpUrl(input) {
  try {
    const url = new URL(String(input || '').trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch { return false; }
}

export function normalizeXtreamBase(input) {
  const url = new URL(String(input || '').trim());
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Servidor deve usar HTTP ou HTTPS.');
  if (url.username || url.password || url.search || url.hash) throw new Error('Use apenas endereço e porta do servidor Xtream.');
  if (url.pathname !== '/' && url.pathname !== '') throw new Error('Informe a raiz do servidor, sem caminho.');
  return url.origin;
}

export function buildXtreamLiveUrl(base, username, password, streamId, extension = 'm3u8') {
  const origin = normalizeXtreamBase(base);
  if (!username || !password || !/^\d+$/.test(String(streamId))) throw new Error('Credenciais ou canal Xtream inválidos.');
  if (!['ts', 'm3u8'].includes(extension)) throw new Error('Formato inválido.');
  return origin + '/live/' + encodeURIComponent(username) + '/' +
    encodeURIComponent(password) + '/' + String(streamId) + '.' + extension;
}

export function inferKind(name, url, radioTag = false) {
  return radioTag || AUDIO_SUFFIX.test(url) || /\b(radio|rádio|fm)\b/i.test(name) ? 'radio' : 'tv';
}

function attrs(value) {
  const result = {};
  const re = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match;
  while ((match = re.exec(value))) result[match[1].toLowerCase()] = match[2] ?? match[3];
  return result;
}

// Vírgulas em atributos, como tvg-name="HD,FHD,4K", não separam o título.
function extinfSeparator(line) {
  let quote = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ',') {
      return i;
    }
  }
  return -1;
}

export function parseM3u(text, baseUrl) {
  if (typeof text !== 'string') throw new Error('Playlist deve ser um texto.');
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (!lines.some(line => line.trim().startsWith('#EXTM3U'))) throw new Error('Arquivo não parece uma playlist M3U.');
  if (lines.some(line => /^\s*#EXT-X-(TARGETDURATION|STREAM-INF|MEDIA-SEQUENCE)/i.test(line))) {
    throw new Error('Esse endereço é um stream HLS, não um catálogo M3U. Use URL de mídia.');
  }
  const result = [];
  let meta = null;
  let group = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF:')) {
      const idx = extinfSeparator(line);
      const header = idx >= 0 ? line.slice(0, idx) : line;
      const properties = attrs(header);
      const title = idx >= 0 ? line.slice(idx + 1).trim() : '';
      meta = { title: title || properties['tvg-name'] || 'Sem nome', group: properties['group-title'] || group,
        logo: properties['tvg-logo'] || '', radio: properties.radio === 'true' };
    } else if (line.startsWith('#EXTGRP:')) {
      group = line.slice(8).trim();
      if (meta) meta.group = group;
    } else if (!line.startsWith('#')) {
      let url = line;
      if (baseUrl) {
        try { url = new URL(line, baseUrl).href; } catch { continue; }
      }
      if (!isHttpUrl(url)) { meta = null; continue; }
      const title = meta?.title || ('Canal ' + (result.length + 1));
      result.push({
        id: 'm3u-' + result.length,
        name: title,
        url,
        group: meta?.group || 'Sem categoria',
        kind: inferKind(title, url, meta?.radio),
        logo: meta?.logo || ''
      });
      meta = null;
    }
  }
  return result;
}
