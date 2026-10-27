import {deriveCatalogPresentation} from './cinema-title.js';
/**
 * Interface read-only para enriquecimento TMDB.
 * Nunca envia URL de stream, chave de origem ou catálogo ao servidor.
 */
const quality = /^(?:4K|UHD|FHD|FULL\s*HD|HD|SD|HDR|HEVC|H265|H264|DUB|DUBLADO|LEG|LEGENDADO|PT-BR|BR)\s*[:|\-]\s*/i;
const tailQuality = /\s*(?:[|\-]|\[|\()\s*(?:4K|UHD|FHD|FULL\s*HD|HD|SD|HDR|HEVC|H265|H264|DUBLADO|LEGENDADO|PT-BR)\s*(?:\]|\))?\s*$/i;
const course = /curso|aula|treinamento|workshop|tutorial|modulo|m[oó]dulo|palestra|livro|leitura/i;

export function tmdbQueryForItem(item, role) {
  if (!item || (role !== 'movies' && role !== 'series')) return null;
  if (course.test(String(item.group || '')) || String(item.kind || '') === 'radio') return null;
  const presentation=deriveCatalogPresentation(item.displayName||item.name,item.catalogYear);
  let name = presentation.title.trim();
  if (!name || name.length > 160) return null;
  // Alguns provedores acrescentam +, ★, tags [FILME] ou qualidade antes do nome.
  name = name.replace(/^[\s+*•▪▶►★☆✓✔!#]+/u, '')
    .replace(/^(?:\[(?:FILMES?|MOVIES?|S[EÉ]RIES?|TV)\]\s*)+/i, '')
    .replace(quality, '');
  for (let i = 0; i < 3; i++) name = name.replace(tailQuality, '');
  const yearMatch = name.match(/(?:\(|\[|\s)(19\d\d|20[0-3]\d)(?:\)|\]|\s|$)/);
  const catalogYear = Number(item.catalogYear||presentation.year);
  const year = Number.isInteger(catalogYear) && catalogYear >= 1900 && catalogYear <= 2099
    ? catalogYear : yearMatch ? Number(yearMatch[1]) : null;
  if (yearMatch) name = name.replace(yearMatch[0], ' ');
  // Etiquetas de resolução podem vir depois do ano, sem separador.
  name = name.replace(/\s+(?:4K|UHD|FHD|FULL\s*HD|HD|SD|HDR|HEVC|H265|H264)\s*$/i, '');
  if (role === 'series') {
    name = name.replace(/\s*(?:[|:\-]\s*)?(?:S\d{1,2}\s*E\d{1,3}|T\d{1,2}\s*E\d{1,3})\b.*$/i, '');
  }
  if (role === 'series') name = name.replace(/\s+(?:S|T)\d{1,2}\s*$/i, '');
  name = name.replace(/\s*[|\-]\s*$/, '').replace(/\s+/g, ' ').trim();
  if (name.length < 3 || name.length > 130 || /^\d+$/.test(name)) return null;
  const tmdbId = Number(item.tmdbId);
  return { type: role === 'movies' ? 'movie' : 'tv', title: name, year,
    ...(Number.isSafeInteger(tmdbId) && tmdbId > 0 && tmdbId <= 999999999 ? { tmdbId } : {}) };
}

export const metadataNeeded = (config, mode) => mode === 'details'
  ? config.imageEngine !== 'playlist' || config.summaryEngine === 'tmdb'
  : config.imageEngine === 'tmdb' || config.imageEngine === 'hybrid';

export function chooseArtwork(original, matched, imageEngine) {
  const playlistImage = original || '';
  if (!matched || matched.status !== 'matched') return playlistImage;
  if (imageEngine === 'playlist') return playlistImage;
  // TMDB é a prioridade visual quando ligado; M3U sempre entra como reserva.
  if (imageEngine === 'tmdb' || imageEngine === 'hybrid') return matched.poster || playlistImage;
  return playlistImage;
}

export async function requestTmdb(query, fetcher = fetch, signal) {
  if (!query) return null;
  const response = await fetcher('/api/metadata/tmdb', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    referrerPolicy: 'no-referrer',
    body: JSON.stringify(query),
    signal
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data && data.status === 'matched' ? data : null;
}

/** Aguarda TMDB antes de mostrar arte; logo de episódio nunca vira capa de série. */
export function catalogArtwork(original,matched,imageEngine,role){
 if(imageEngine==='playlist'||role==='tv')return original||'';
 if(matched?.status==='matched')return matched.poster||(role==='series'?'':original||'');
 if(!matched)return '';
 return role==='series'?'':original||'';
}
