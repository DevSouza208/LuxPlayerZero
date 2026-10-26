/**
 * TMDB: títulos normalizados e correspondência aproximada conservadora.
 * Ano é obrigatório para aproximação textual; títulos ambíguos não são usados.
 * tmdb-id explícito da M3U permite consulta direta; nunca confundir tvg-id EPG.
 * Metadados jamais mudam URL de vídeo ou identificação do item.
 */
export const TMDB_LIMITS = Object.freeze({
  dailyRemoteLookups: 5000,
  matchTtlMs: 60 * 24 * 60 * 60 * 1000,
  missTtlMs: 7 * 24 * 60 * 60 * 1000
});
const normalize = value => String(value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
  .replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
const canonical = value => normalize(value)
  .replace(/^(?:(?:a|o|os|as|the|an|el|la|los|las|um|uma|un|une)\s+)+/, '');

export function validateQuery(value) {
  const type = value?.type;
  const title = typeof value?.title === 'string' ? value.title.trim().replace(/\s+/g, ' ') : '';
  const year = value?.year == null || value.year === '' ? null : Number(value.year);
  if (!['movie', 'tv'].includes(type) || title.length < 3 || title.length > 130 ||
    /[\r\n\u0000-\u001f]/.test(title) ||
    (year !== null && (!Number.isInteger(year) || year < 1900 || year > 2035))) return null;
  const normalized = normalize(title);
  if (normalized.length < 3 || /^(filme|serie|movie|video|episodio|canal|aula)\s*\d*$/i.test(normalized)) return null;
  const hasId = value?.tmdbId !== undefined && value?.tmdbId !== null && value?.tmdbId !== '';
  const tmdbId = hasId ? Number(value.tmdbId) : null;
  if (hasId && (!Number.isSafeInteger(tmdbId) || tmdbId < 1 || tmdbId > 999999999)) return null;
  // Versionamento: resultados "unmatched" do algoritmo rígido antigo não bloqueiam o novo.
  return { type, title, year, tmdbId,
    key: 'v2:' + type + ':' + (year || '-') + ':' + normalized + ':' + (tmdbId || '-') };
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

function formatMatch(query, row) {
  const genres = Array.isArray(row.genre_ids) ? row.genre_ids :
    Array.isArray(row.genres) ? row.genres.map(entry => entry?.id) : [];
  return {
    status: 'matched',
    title: query.title, // Preserva a identidade M3U.
    year: publishedYear(row),
    tmdbId: row.id,
    overview: typeof row.overview === 'string' ? row.overview.slice(0, 1400) : '',
    poster: officialImage(row.poster_path, 'w500'),
    backdrop: officialImage(row.backdrop_path, 'w1280'),
    rating: Number.isFinite(row.vote_average) ? Math.round(row.vote_average * 10) / 10 : null,
    genres: genres.filter(id => Number.isInteger(id) && GENRES[id]).slice(0, 3).map(id => GENRES[id])
  };
}

function namesOf(query, row) {
  return query.type === 'movie' ? [row.title, row.original_title] : [row.name, row.original_name];
}

/** Similaridade textual limitada para evitar "Duna" => "Duna 2" e outros homônimos. */
function similarity(first, second) {
  if (first === second) return 1;
  if (!first || !second || Math.min(first.length, second.length) < 6) return 0;
  if (Math.abs(first.length - second.length) / Math.max(first.length, second.length) > .16) return 0;
  const previous = Array.from({ length: second.length + 1 }, (_, i) => i);
  for (let i = 1; i <= first.length; i++) {
    let prior = previous[0];
    previous[0] = i;
    for (let j = 1; j <= second.length; j++) {
      const old = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        prior + (first[i - 1] === second[j - 1] ? 0 : 1)
      );
      prior = old;
    }
  }
  return 1 - previous[second.length] / Math.max(first.length, second.length);
}

export function chooseExactMatch(query, results) {
  const candidates = Array.isArray(results) ? results : [];
  const literal = normalize(query.title);
  const normalized = canonical(query.title);
  const scored = [];
  for (const row of candidates) {
    if (!row || !Number.isInteger(row.id) || row.id < 1 || row.adult === true) continue;
    const year = publishedYear(row);
    // Quando a M3U traz ano, nunca associar outro ano.
    if (query.year !== null && year !== query.year) continue;
    const names = namesOf(query, row).filter(Boolean);
    const exact = names.some(name => normalize(name) === literal);
    const canonicalExact = names.some(name => canonical(name) === normalized);
    // Sem ano: aceitar só texto igual (inclusive artigos); não adivinhar por semelhança.
    const proximity = query.year === null ? 0 :
      Math.max(0, ...names.map(name => similarity(normalized, canonical(name))));
    const score = exact ? 1 : canonicalExact ? .99 : proximity;
    if (score >= .86) scored.push({ row, score });
  }
  const unique = [...new Map(scored.map(entry => [entry.row.id, entry])).values()]
    .sort((a, b) => b.score - a.score);
  if (!unique.length) return null;
  // Dois filmes/séries parecidos? Sem segurança, mantém a capa da playlist.
  if (unique.length > 1 && unique[0].score - unique[1].score < .07) return null;
  return formatMatch(query, unique[0].row);
}

/** ID explícito vence diferenças de idioma; ano da M3U continua obrigatório se presente. */
export function chooseIdMatch(query, row) {
  if (!row || !Number.isInteger(row.id) || row.id !== query.tmdbId || row.adult === true) return null;
  if (query.year !== null && publishedYear(row) !== query.year) return null;
  return formatMatch(query, row);
}
