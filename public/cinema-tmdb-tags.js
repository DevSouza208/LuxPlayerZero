/**
 * Extrai IDs TMDB explícitos de EXTINF sem modificar o parser M3U original.
 * tvg-id genérico identifica EPG/canal, NÃO TMDB.
 * Apenas campos tmdb-id / tmdb_id e tvg-id="tmdb:123" são aceitos.
 */
function readTmdbId(header) {
  const explicit = /(?:^|\s)tmdb[-_]id\s*=\s*(?:"(\d{1,9})"|'(\d{1,9})'|(\d{1,9}))/i.exec(header);
  const prefixed = /(?:^|\s)tvg-id\s*=\s*["']tmdb[:._-](\d{1,9})["']/i.exec(header);
  const raw = explicit?.slice(1).find(Boolean) || prefixed?.[1];
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 && id <= 999999999 ? id : null;
}

export function attachCinemaTmdbIds(text, entries, baseUrl) {
  if (!Array.isArray(entries) || !entries.length ||
      typeof text !== 'string' || !/(?:tmdb[-_]id|tvg-id\s*=\s*["']tmdb[:._-])/i.test(text)) return entries;

  // Escaneia apenas EXTINF que têm um ID explícito; não materializa um 2º catálogo.
  const byUrl = new Map();
  const metadataLines = /^#EXTINF:[^\r\n]*/gm;
  let match;
  while ((match = metadataLines.exec(text))) {
    const tmdbId = readTmdbId(match[0]);
    if (!tmdbId) continue;
    let offset = metadataLines.lastIndex;
    // Próxima URL de mídia; linhas #EXTGRP e outras tags são ignoradas.
    for (let lineCount = 0; lineCount < 12 && offset < text.length; lineCount++) {
      if (text[offset] === '\r') offset++;
      if (text[offset] === '\n') offset++;
      const end = text.indexOf('\n', offset);
      const line = text.slice(offset, end < 0 ? text.length : end).trim();
      offset = end < 0 ? text.length : end + 1;
      if (!line) continue;
      if (line.startsWith('#EXTINF:')) break;
      if (line.startsWith('#')) continue;
      let url = line;
      if (baseUrl) {
        try { url = new URL(line, baseUrl).href; } catch { break; }
      }
      if (/^https?:\/\//i.test(url)) byUrl.set(url, tmdbId);
      break;
    }
  }
  if (!byUrl.size) return entries;
  for (const item of entries) {
    const id = byUrl.get(item.url);
    if (id) item.tmdbId = id;
  }
  return entries;
}
