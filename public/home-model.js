/**
 * Lux Home: organização visual independente do motor de reprodução.
 * Os links da M3U e credenciais nunca são gravados em armazenamento local.
 */
export const DEFAULT_SETTINGS = Object.freeze({
  heroTitle: 'Seu universo. Seu próximo play.',
  heroSubtitle: 'Tudo o que você gosta, em um só lugar. Sua biblioteca, do seu jeito.',
  tvTitle: 'Destaques da TV',
  moviesTitle: 'Filmes em alta',
  seriesTitle: 'Séries do momento',
  continueTitle: 'Continuar assistindo',
  favoritesTitle: 'Minha lista',
  tvKeywords: '',
  moviesKeywords: '',
  seriesKeywords: '',
  heroMode: 'auto',
  pinnedName: '',
  heroBackdrop: '',
  railOrder: 'personal',
  density: 'comfortable',
  imageEngine: 'tmdb',
  summaryEngine: 'tmdb'
});

export function normalizeSettings(value = {}) {
  const safe = {};
  for (const [key, fallback] of Object.entries(DEFAULT_SETTINGS)) {
    const raw = typeof value?.[key] === 'string' ? value[key].trim() : '';
    safe[key] = raw ? raw.slice(0, key === 'heroBackdrop' ? 2048 : key.endsWith('Keywords') ? 220 : key === 'pinnedName' ? 130 : 90) : fallback;
  }
  if (!['playlist', 'tmdb', 'hybrid'].includes(safe.imageEngine)) safe.imageEngine = DEFAULT_SETTINGS.imageEngine;
  if (!['off', 'tmdb'].includes(safe.summaryEngine)) safe.summaryEngine = 'off';
  return safe;
}

function normalize(text) {
  return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function words(value) {
  return String(value || '').split(',').map(s => normalize(s.trim())).filter(Boolean);
}

export function classifyItem(item, settings = DEFAULT_SETTINGS, compiledKeywords = null) {
  // Xtream declara o tipo no caminho. Um canal pode estar no grupo NOVELAS
  // ou FILMES sem deixar de ser uma transmissão ao vivo.
  const path = String(item?.url || '').toLowerCase().split(/[?#]/)[0].replace(/^https?:\/\/[^/]+/, '');
  if (path.startsWith('/live/')) return 'tv';
  if (path.startsWith('/movie/')) return 'movies';
  if (path.startsWith('/series/')) return 'series';
  const group = normalize(item?.group);
  const name = normalize(item?.name);
  // Os campos do admin permitem usar qualquer grupo da M3U em cada vitrine.
  const keywords = compiledKeywords || [
    ['tv', words(settings.tvKeywords)],
    ['movies', words(settings.moviesKeywords)],
    ['series', words(settings.seriesKeywords)]
  ];
  for (const [role, terms] of keywords) {
    if (terms.some(term => group.includes(term))) return role;
  }
  // Evita instanciar URL centenas de milhares de vezes ao classificar uma M3U grande.
  if (/\/series\//.test(path) || /serie|temporad|episod|novela|dorama|anime|modulo/.test(group)) return 'series';
  if (/\/movie\//.test(path) || /filme|movie|cinema|lancamento|vod|documentario|curso|aula|treinamento|workshop/.test(group)) return 'movies';
  if (/\/live\//.test(path) || /tv|canal|ao vivo|esporte|noticia|radio/.test(group)) return 'tv';
  if (/\b(temporada|episodio|s[0-9]{1,2}e[0-9]{1,3})\b/.test(name)) return 'series';
  return 'tv';
}

export function itemKey(item) {
  // Identificador não reversível para retomar um título após reimportar a lista.
  // Não inclui URL, usuário, senha nem parâmetros da origem.
  const text = String(item?.name || '') + '\u241f' + String(item?.group || '');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function safeImage(url) {
  try {
    if (typeof url !== 'string' || url.length > 2048) return '';
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.href : '';
  } catch { return ''; }
}

export function shouldResume(position, duration) {
  return Number.isFinite(position) && Number.isFinite(duration) &&
    duration > 90 && position > 15 && position < duration - 25;
}

export function buildShowcase(items, settings = DEFAULT_SETTINGS, savedKeys = []) {
  const rails = { tv: [], movies: [], series: [] };
  // Referências aos itens já carregados; sem duplicar 260 mil objetos ou reclassificar nas páginas.
  const catalogs = { tv: [], movies: [], series: [] };
  const counts = { tv: 0, movies: 0, series: 0 };
  const detectedGroups = new Map();
  const matches = new Map();
  const saved = new Set(savedKeys);
  const seenGroups = { tv: new Set(), movies: new Set(), series: new Set() };
  const keywords = [
    ['tv', words(settings.tvKeywords)],
    ['movies', words(settings.moviesKeywords)],
    ['series', words(settings.seriesKeywords)]
  ];
  for (const item of items) {
    const role = classifyItem(item, settings, keywords);
    counts[role]++;
    catalogs[role].push(item);
    const group = String(item.group || 'Sem categoria');
    if (detectedGroups.size < 5000 || detectedGroups.has(group)) {
      detectedGroups.set(group, (detectedGroups.get(group) || 0) + 1);
    }
    if (saved.size) {
      const key = itemKey(item);
      if (saved.has(key) && !matches.has(key)) matches.set(key, item);
    }
    const rail = rails[role];
    if (rail.length < 16) {
      rail.push(item);
      seenGroups[role].add(group);
    } else if (!seenGroups[role].has(group)) {
      // Prefere diversidade de grupos e capas reais; evita 16 itens da mesma categoria.
      const replace = rail.findIndex((entry, i) => i > 2 && !safeImage(entry.logo));
      if (replace !== -1) {
        seenGroups[role].delete(String(rail[replace].group || 'Sem categoria'));
        rail[replace] = item;
        seenGroups[role].add(group);
      }
    } else if (safeImage(item.logo)) {
      const replace = rail.findIndex((entry, i) => i > 2 && !safeImage(entry.logo));
      if (replace !== -1) rail[replace] = item;
    }
  }
  const groups = [...detectedGroups].sort((a, b) => b[1] - a[1]).slice(0, 16);
  return { rails, catalogs, counts, matches, groups };
}
