/**
 * Apresentação editorial de M3U inspirada no Lux Player 2.0.
 *
 * NÃO altera: item.name original, item.url, IDs, grupo, lista R2 ou reprodução.
 * Somente campos derivados e pequenos, calculados 1 vez por importação no Cinema.
 */
const decoration = /^(?:[+\-–—]\s*)+/u;
const presentationToken = /\s*\[(?:l|leg|legendado|dub|dublado|cinema)\]\s*/giu;
const qualityPrefix = /^(?:(?:\[(?:4k|uhd|fhd|full\s*hd|hd|sd|hdr|hevc|h265|h264)\]|(?:4k|uhd|fhd|full\s*hd|hd|sd|hdr))\s*[-–—|:]\s*)+/i;
const qualityTail = /\s*(?:[-–—|:]\s*(?:4k|uhd|fhd|full\s*hd|hd|sd|hdr|hevc|h265|h264)|\[(?:4k|uhd|fhd|full\s*hd|hd|sd|hdr|hevc|h265|h264)\]|\((?:2160p|1080p|720p|480p|4k|uhd|fhd|hd)\))\s*$/i;
const endYear = /\s*(?:\(\s*((?:19|20)\d{2})\s*\)|\[\s*((?:19|20)\d{2})\s*\]|\{\s*((?:19|20)\d{2})\s*\}|[-–—|]\s*((?:19|20)\d{2}))\s*$/u;
const endDate = /\s*(?:\(|\[|\{)?(?:0?[1-9]|[12]\d|3[01])[\/.-](?:0?[1-9]|1[012])[\/.-](?:19|20)\d{2}(?:\)|\]|\})?\s*$/u;

/** Only decorative year markers; a bare "2049" may be part of the film title. */
export function deriveCatalogPresentation(raw, suppliedYear = null) {
  const original = String(raw ?? '').trim();
  if (!original) return { title: String(raw ?? ''), year: null, tags: [] };
  const markers = [];
  if (/\[(?:dub|dublado)\]/i.test(original)) markers.push('Dublado');
  if (/\[(?:l|leg|legendado)\]/i.test(original)) markers.push('Legendado');
  if (/\[cinema\]/i.test(original)) markers.push('Cinema');

  let title = original.replace(decoration, '').replace(qualityPrefix, '');
  title = title.replace(presentationToken, ' ').replace(/\s+/g, ' ').trim();
  // Eliminar qualidade/datas SOMENTE como sufixos com separadores claros.
  for (let i = 0; i < 3; i++) title = title.replace(qualityTail, '').trim();
  title = title.replace(endDate, '').trim();
  // Detectar ano explícito para consulta do TMDB e retirá-lo do nome de exibição.
  const match = endYear.exec(title);
  const markedYear = match ? Number(match.slice(1).find(Boolean)) : null;
  const parsedYear = Number(suppliedYear);
  const knownYear = Number.isInteger(parsedYear) && parsedYear >= 1900 && parsedYear <= 2099
    ? parsedYear : null;
  const year = knownYear ?? markedYear;
  if (match) title = title.slice(0, match.index).trim();
  if (knownYear) title = title.replace(new RegExp('\\s+' + knownYear + '\\s*$'), '').trim();
  // Ex.: "Duna (2021) - 4K" após tirar a qualidade final.
  for (let i = 0; i < 2; i++) title = title.replace(qualityTail, '').trim();
  if (!title) title = original.replace(decoration, '').trim() || original;
  return { title, year, tags: markers };
}

/**
 * Mantém name/url exatamente como fornecidos; adiciona somente dados de UI.
 * O chamador já cria uma cópia para atribuir o id cNNNNNN, sem segundo catálogo.
 */
export function presentationForEntry(item) {
  const result = deriveCatalogPresentation(item.name, item.catalogYear ?? item.year);
  return {
    ...(result.title && result.title !== item.name ? { displayName: result.title } : {}),
    ...(result.year ? { catalogYear: result.year } : {}),
    ...(result.tags.length ? { catalogTags: result.tags } : {})
  };
}

export function titleForDisplay(item) {
  return String(item?.displayName || item?.name || '');
}
