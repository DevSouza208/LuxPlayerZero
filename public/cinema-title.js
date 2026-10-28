import {classifyMediaCategories,mediaFeatures,normalizeMediaGroup} from './media-taxonomy.js';
import {canonicalTvName} from './tv-normalizer.js';
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
  if (/\b(?:dub|dublad[oa]s?)\b/i.test(original)) markers.push('Dublado');
  if (/(?:\[(?:l|leg|legendado)\]|\b(?:leg|legendad[oa]s?)\b)/i.test(original)) markers.push('Legendado');
  if (/\[cinema\]/i.test(original)) markers.push('Cinema');

  let title = original.replace(decoration, '').replace(qualityPrefix, '');
  title = title.replace(presentationToken, ' ').replace(/\b(?:dublad[oa]s?|dub|legendad[oa]s?|leg)\b/giu, ' ').replace(/[\[(]\s*[\])]/g, ' ').replace(/\s+/g, ' ').replace(/^[\s|:\-–—]+|[\s|:\-–—]+$/g,'').trim();
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
const categoryPresentationCache=new Map();
function categoryPresentation(group,genres){
 const key=JSON.stringify([group,genres]);
 if(categoryPresentationCache.has(key))return categoryPresentationCache.get(key);
 const value={classified:classifyMediaCategories([group],genres),normalizedGroup:group.split('|').map(normalizeMediaGroup).filter(Boolean).join(' | ')};
 categoryPresentationCache.set(key,value);if(categoryPresentationCache.size>512)categoryPresentationCache.delete(categoryPresentationCache.keys().next().value);
 return value;
}
export function presentationForEntry(item) {
  const result = deriveCatalogPresentation(item.name, item.catalogYear ?? item.year);
  const rawGroup=String(item.group||'');
  const {classified,normalizedGroup}=categoryPresentation(rawGroup,item.genres||[]);
  const tags=[...new Set([...result.tags,...mediaFeatures(item.name),...classified.genres,
    ...classified.platforms,...classified.collections])];

  const tvTitle=item.kind==='tv'&&/(\/live\/|canal|tv|esporte|sport|ao vivo)/i.test((item.url||'')+' '+rawGroup)
    ?canonicalTvName(result.title):result.title;
  return {
    ...(tvTitle&&tvTitle!==item.name?{displayName:tvTitle}:{}),
    ...(result.year?{catalogYear:result.year}:{}),
    ...(tags.length?{catalogTags:tags}:{}),
    ...(normalizedGroup&&normalizedGroup!==rawGroup?{normalizedGroup}:{}),
    ...(classified.genreIds.length?{catalogGenreIds:classified.genreIds.slice()}:{}),
    ...(classified.platformIds.length?{catalogPlatformIds:classified.platformIds.slice()}:{}),
    ...(classified.collectionIds.length?{catalogCollectionIds:classified.collectionIds.slice()}:{})
  };
}

export function titleForDisplay(item) {
  return String(item?.displayName || item?.name || '');
}
