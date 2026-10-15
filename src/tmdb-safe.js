/**
 * Correspondência estrita com TMDB. Nunca determina o item de reprodução.
 * Uma consulta = no máximo uma busca na API, sem pesquisa fuzzy, detalhes ou
 * varredura do catálogo. Falha/ambiguidade => dados da M3U sem mudanças.
 */
export const TMDB_LIMITS = Object.freeze({
  dailyRemoteLookups: 120,
  matchTtlMs: 60 * 24 * 60 * 60 * 1000,
  missTtlMs: 7 * 24 * 60 * 60 * 1000
});
const normalize = value => String(value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
  .replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');

export function validateQuery(value) {
  const type = value?.type;
  const title = typeof value?.title === 'string' ? value.title.trim().replace(/\s+/g, ' ') : '';
  const year = value?.year == null || value.year === '' ? null : Number(value.year);
  if (!['movie', 'tv'].includes(type) || title.length < 3 || title.length > 130 ||
    /[\r\n\u0000-\u001f]/.test(title) ||
    (year !== null && (!Number.isInteger(year) || year < 1900 || year > 2035))) return null;
  const normalized = normalize(title);
  if (normalized.length < 3 || /^(filme|serie|movie|video|episodio|canal|aula)\s*\d*$/i.test(normalized)) return null;
  return { type, title, year, key: type + ':' + (year || '-') + ':' + normalized };
}

const publishedYear = row => {
  const date = String(row.release_date || row.first_air_date || '');
  const match = /^(19\d\d|20[0-3]\d)-\d\d-\d\d$/.exec(date);
  return match ? Number(match[1]) : null;
};
const officialImage = (path, size) =>
  typeof path === 'string' && /^\/[a-zA-Z0-9_.-]{2,100}$/.test(path)
    ? 'https://image.tmdb.org/t/p/' + size + path : null;

const GENRES = Object.freeze({
  12: 'Aventura', 14: 'Fantasia', 16: 'Animação', 18: 'Drama',
  27: 'Terror', 28: 'Ação', 35: 'Comédia', 36: 'História',
  37: 'Faroeste', 53: 'Suspense', 80: 'Crime', 99: 'Documentário',
  9648: 'Mistério', 10402: 'Música', 10749: 'Romance',
  10751: 'Família', 10752: 'Guerra', 10759: 'Ação e aventura',
  10762: 'Infantil', 10763: 'Notícias', 10764: 'Reality',
  10765: 'Sci-Fi e fantasia', 10766: 'Novela', 10767: 'Talk show',
  10768: 'Guerra e política', 10770: 'Telefilme', 878: 'Ficção científica'
});

export function chooseExactMatch(query, results) {
  const candidates = Array.isArray(results) ? results : [];
  const lookup = normalize(query.title);
  const exact = candidates.filter(row => {
    if (!row || !Number.isInteger(row.id) || row.id < 1) return false;
    const names = query.type === 'movie' ?
      [row.title, row.original_title] : [row.name, row.original_name];
    if (!names.some(title => normalize(title) === lookup)) return false;
    const year = publishedYear(row);
    if (query.year !== null && year !== query.year) return false;
    return true;
  });
  const unique = [...new Map(exact.map(row => [row.id, row])).values()];
  // Mesmo título em vários anos, quando a M3U não dá ano? Não arriscar.
  if (unique.length !== 1) return null;
  const row = unique[0];
  return {
    status: 'matched',
    title: query.title, // O nome do catálogo nunca é substituído.
    year: publishedYear(row),
    overview: typeof row.overview === 'string' ? row.overview.slice(0, 1400) : '',
    poster: officialImage(row.poster_path, 'w500'),
    backdrop: officialImage(row.backdrop_path, 'w1280'),
    rating: Number.isFinite(row.vote_average) ? Math.round(row.vote_average * 10) / 10 : null,
    genres: Array.isArray(row.genre_ids) ? row.genre_ids
      .filter(id => Number.isInteger(id) && GENRES[id])
      .slice(0, 3).map(id => GENRES[id]) : []
  };
}
