/** Paginação de catálogos de grande porte — retorna só uma página de cards. */
export const CATALOG_PAGE_SIZE = 48;
export const BROWSE_ROUTES = Object.freeze({
  '#destaques-tv': 'tv',
  '#destaques-filmes': 'movies',
  '#destaques-series': 'series',
  '#minha-lista': 'favorites'
});
export function browseRoleFromHash(hash) {
  return BROWSE_ROUTES[String(hash || '')] || null;
}
export function browsePageData(entries, { page = 1, query = '', group = '', pageSize = CATALOG_PAGE_SIZE } = {}) {
  const source = Array.isArray(entries) ? entries : [];
  const search = String(query || '').trim().toLocaleLowerCase('pt-BR');
  const requestedGroup = String(group || '').trim();
  const matched = !search && !requestedGroup ? source : source.filter(item => {
    if (requestedGroup && String(item.group || '') !== requestedGroup) return false;
    return !search || (String(item.displayName || item.name || '') + ' ' + String(item.name || '') + ' ' + String(item.group || ''))
      .toLocaleLowerCase('pt-BR').includes(search);
  });
  const size = Math.max(1, Math.min(72, Math.floor(Number(pageSize) || CATALOG_PAGE_SIZE)));
  const pageCount = Math.max(1, Math.ceil(matched.length / size));
  const selected = Number.isFinite(Number(page)) ? Math.min(pageCount, Math.max(1, Math.trunc(Number(page)))) : 1;
  return {
    entries: matched.slice((selected - 1) * size, selected * size),
    page: selected, pageCount, total: matched.length,
    start: matched.length ? (selected - 1) * size + 1 : 0,
    end: Math.min(selected * size, matched.length)
  };
}
export function browseGroups(entries, max = 70) {
  const counts = new Map();
  for (const entry of entries || []) {
    const name = String(entry.group || '').trim();
    if (name) counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, max);
}
