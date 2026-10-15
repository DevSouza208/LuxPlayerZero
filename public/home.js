import { DEFAULT_SETTINGS, normalizeSettings, buildShowcase, classifyItem, itemKey, safeImage, shouldResume } from './home-model.js';
import { tmdbQueryForItem, metadataNeeded, chooseArtwork, requestTmdb } from './tmdb-client.js';

const STORAGE = 'luxzero:home:';
const $ = id => document.getElementById(id);
function read(key, fallback) {
  try { const value = JSON.parse(localStorage.getItem(STORAGE + key)); return value ?? fallback; }
  catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(STORAGE + key, JSON.stringify(value)); } catch {}
}
function validEntries(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 70).filter(x => x && typeof x.key === 'string' &&
    typeof x.name === 'string' && typeof x.group === 'string')
    .map(x => ({ key: x.key.slice(0, 24), name: x.name.slice(0, 130),
      group: x.group.slice(0, 130), at: Number(x.at) || 0,
      position: Number(x.position) || 0, duration: Number(x.duration) || 0 }));
}
function record(item, position = 0, duration = 0) {
  return { key: itemKey(item), name: String(item.name || '').slice(0, 130),
    group: String(item.group || '').slice(0, 130), at: Date.now(),
    position: Number.isFinite(position) ? position : 0,
    duration: Number.isFinite(duration) ? duration : 0 };
}
function appendText(parent, tag, className, value) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = value;
  parent.append(node);
  return node;
}

export function createHome({ play } = {}) {
  let items = [];
  let configRaw = read('settings', {});
  let config = normalizeSettings(configRaw);
  let favorites = validEntries(read('favorites', []));
  let recent = validEntries(read('recent', []));
  let showcase = buildShowcase([], config);
  let heroItem = null;
  let active = null;
  let lastProgress = 0;

  // O formulário de origem continua na sidebar, intacto e sempre acessível.
  const sourceDrawer = $('source-drawer');
  const sourceOverlay = $('source-overlay');
  const detailsDialog = $('details-dialog');
  let detailsItem = null;
  let pinnedItem = null;
  let drawerReturnFocus = null;
  let searchTimer = null;
  // Nunca consultar em massa: até 10 títulos por aba e no máximo 4 automáticos
  // para toda a Home; nenhum lookup é disparado durante o parsing da M3U.
  const tmdbResolved = new Map();
  const tmdbPending = new Map();
  let tmdbCalls = 0;
  let autoEnriched = 0;
  const MAX_TMDB_CALLS = 10;
  const MAX_AUTO_ENRICH = 4;

  const adminDialog = $('admin-dialog');
  const railsRoot = $('home-rails');

  function openDialog(dialog) {
    if (dialog && !dialog.open) dialog.showModal();
  }
  function closeDialog(dialog) {
    if (dialog?.open) dialog.close();
  }
  function openDrawer() {
    drawerReturnFocus = document.activeElement;
    sourceDrawer?.classList.add('is-open');
    if (sourceDrawer) {
      sourceDrawer.inert = false;
      sourceDrawer.setAttribute('aria-hidden', 'false');
    }
    if (sourceOverlay) sourceOverlay.hidden = false;
    document.body.classList.add('source-open');
    $('source-url')?.focus({ preventScroll: true });
  }
  function closeDrawer() {
    sourceDrawer?.classList.remove('is-open');
    if (sourceDrawer) {
      sourceDrawer.inert = true;
      sourceDrawer.setAttribute('aria-hidden', 'true');
    }
    if (sourceOverlay) sourceOverlay.hidden = true;
    document.body.classList.remove('source-open');
    drawerReturnFocus?.focus?.({ preventScroll: true });
  }
  for (const id of ['open-source', 'hero-connect', 'empty-connect']) {
    $(id)?.addEventListener('click', openDrawer);
  }
  $('drawer-close')?.addEventListener('click', closeDrawer);
  sourceOverlay?.addEventListener('click', closeDrawer);
  document.querySelectorAll('.source-shortcut').forEach(anchor => {
    anchor.addEventListener('click', event => { event.preventDefault(); openDrawer(); });
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && sourceDrawer?.classList.contains('is-open')) closeDrawer();
  });
  const navSearch = $('nav-search');
  navSearch?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const search = $('search');
      if (search) { search.value = navSearch.value; search.dispatchEvent(new Event('input', { bubbles: true })); }
    }, 260);
  });
  navSearch?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      clearTimeout(searchTimer);
      const search = $('search');
      if (search) { search.value = navSearch.value; search.dispatchEvent(new Event('input', { bubbles: true })); }
      $('biblioteca')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  const navLinks = [...document.querySelectorAll('.cinema-nav-link')];
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      navLinks.forEach(el => { el.classList.remove('is-active'); el.removeAttribute('aria-current'); });
      link.classList.add('is-active');
      link.setAttribute('aria-current', 'page');
    });
  });

  $('open-admin')?.addEventListener('click', () => {
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      const field = $('admin-' + key);
      if (field) field.value = config[key];
    }
    const list = $('detected-groups');
    if (list) list.textContent = showcase.groups.length ?
      showcase.groups.slice(0, 9).map(([name, count]) => name + ' (' + count + ')').join(' · ') :
      'Conecte uma playlist para identificar os grupos disponíveis.';
    const counts = showcase.counts;
    $('admin-stats').textContent = items.length ?
      items.length.toLocaleString('pt-BR') + ' títulos · ' +
      counts.tv.toLocaleString('pt-BR') + ' TV · ' +
      counts.movies.toLocaleString('pt-BR') + ' Filmes/Cursos · ' +
      counts.series.toLocaleString('pt-BR') + ' Séries/Módulos · ' +
      showcase.groups.length + ' grupos em destaque' :
      'Conecte uma fonte para visualizar as estatísticas.';
    for (const flag of ['showContinue','showFavorites','showTv','showMovies','showSeries','hideEmpty']) {
      const checkbox = $('admin-' + flag);
      if (checkbox) checkbox.checked = configRaw[flag] !== false;
    }
    openDialog(adminDialog);
  });
  document.querySelectorAll('[data-close-dialog]').forEach(button => {
    button.addEventListener('click', () => closeDialog($(button.dataset.closeDialog)));
  });
  for (const dialog of [adminDialog]) {
    dialog?.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });
  }

  function settingsTitle(role) {
    if (role === 'movies' && !configRaw.moviesTitle &&
      showcase.groups.some(([group]) => /curso|aula|treinamento/i.test(group)) &&
      !showcase.groups.some(([group]) => /filme|movie|cinema/i.test(group))) return 'Cursos e aulas';
    if (role === 'series' && !configRaw.seriesTitle &&
      showcase.groups.some(([group]) => /m[oó]dulo|temporada/i.test(group)) &&
      !showcase.groups.some(([group]) => /s[eé]rie/i.test(group))) return 'Módulos e episódios';
    return config[role + 'Title'];
  }

  function queryFor(item) {
    if (!item) return null;
    const role = classifyRole(item);
    return tmdbQueryForItem(item, role);
  }
  function classifyRole(item) {
    // A categoria já foi derivada da M3U; nunca confiar em uma imagem TMDB
    // para determinar qual URL será tocada.
    return classifyItem(item, config);
  }
  function keyForQuery(query) {
    return query ? [query.type, query.title.toLocaleLowerCase('pt-BR'), query.year || ''].join('|') : '';
  }
  function cachedMetadata(item) {
    const query = queryFor(item);
    return query ? tmdbResolved.get(keyForQuery(query)) || null : null;
  }
  async function metadataFor(item) {
    const query = queryFor(item);
    if (!query || !metadataNeeded(config, 'details')) return null;
    const key = keyForQuery(query);
    if (tmdbResolved.has(key)) return tmdbResolved.get(key);
    if (tmdbPending.has(key)) return tmdbPending.get(key);
    if (tmdbCalls >= MAX_TMDB_CALLS) return null;
    tmdbCalls++;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    const promise = requestTmdb(query, fetch, controller.signal)
      .catch(() => null)
      .then(data => {
        tmdbResolved.set(key, data);
        return data;
      }).finally(() => {
        clearTimeout(timeout);
        tmdbPending.delete(key);
      });
    tmdbPending.set(key, promise);
    return promise;
  }
  function autoArtRequest(item) {
    if (!item || autoEnriched >= MAX_AUTO_ENRICH ||
      config.imageEngine === 'playlist') return;
    if (config.imageEngine === 'hybrid' && safeImage(item.logo)) return;
    const query = queryFor(item);
    if (!query || tmdbPending.has(keyForQuery(query)) || tmdbResolved.has(keyForQuery(query))) return;
    autoEnriched++;
    void metadataFor(item).then(data => {
      const index = Number(String(item.id || '').slice(1));
      if (data && items[index] === item) render();
    });
  }
  function itemFromKey(key) { return showcase.matches.get(key); }
  function savedKeys() { return [...new Set([...favorites, ...recent].map(x => x.key))]; }
  function rebuild() {
    showcase = buildShowcase(items, config, savedKeys());
    pinnedItem = config.heroMode === 'pinned' && config.pinnedName
      ? items.find(item => item.name === config.pinnedName) || null : null;
  }

  function createCard(item, category, saved = null) {
    const card = document.createElement('article');
    card.className = 'media-card';
    const visual = document.createElement('button');
    visual.type = 'button';
    visual.className = 'media-visual';
    visual.dataset.details = item.id;
    visual.setAttribute('aria-label', 'Ver detalhes de ' + item.name);
    const image = chooseArtwork(safeImage(item.logo), cachedMetadata(item), config.imageEngine);
    if (image) {
      const img = document.createElement('img');
      img.src = image;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => img.remove(), { once: true });
      visual.append(img);
    }
    const monogram = document.createElement('span');
    monogram.className = 'media-monogram';
    monogram.textContent = (item.name || 'L').slice(0, 1).toUpperCase();
    visual.append(monogram);
    appendText(visual, 'span', 'media-play-glyph', '▶');
    if (saved && shouldResume(saved.position, saved.duration)) {
      const progress = document.createElement('span');
      progress.className = 'media-progress';
      const bar = document.createElement('span');
      bar.style.width = Math.min(100, saved.position / saved.duration * 100) + '%';
      progress.append(bar);
      visual.append(progress);
    }
    card.append(visual);
    const info = document.createElement('div');
    info.className = 'media-info';
    const labels = document.createElement('div');
    labels.className = 'media-labels';
    appendText(labels, 'span', 'media-title', item.name);
    const heart = document.createElement('button');
    heart.type = 'button';
    heart.className = 'media-favorite';
    heart.dataset.favorite = item.id;
    const isFavorite = favorites.some(x => x.key === itemKey(item));
    heart.textContent = isFavorite ? '♥' : '♡';
    heart.title = isFavorite ? 'Remover da minha lista' : 'Adicionar à minha lista';
    heart.setAttribute('aria-label', heart.title);
    labels.append(heart);
    info.append(labels);
    appendText(info, 'span', 'media-group', item.group || (category === 'tv' ? 'Ao vivo' : 'Biblioteca'));
    card.append(info);
    return card;
  }

  function createRail(id, title, entries, caption, savedMap = new Map()) {
    const section = document.createElement('section');
    section.className = 'content-rail';
    section.id = id;
    if (id === 'destaques-tv') section.dataset.rail = 'tv';
    const header = document.createElement('div');
    header.className = 'rail-heading';
    const left = document.createElement('div');
    appendText(left, 'span', 'rail-eyebrow', caption);
    appendText(left, 'h2', 'rail-title', title);
    header.append(left);
    if (entries.length > 4) {
      const hint = appendText(header, 'span', 'rail-hint', 'DESLIZE PARA EXPLORAR →');
      hint.setAttribute('aria-hidden', 'true');
    }
    section.append(header);
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'rail-empty';
      empty.textContent = items.length ?
        (id === 'continue' ? 'Comece a assistir para aparecer aqui.' :
        id === 'minha-lista' ? 'Toque no coração de um título para salvá-lo aqui.' :
        'Nenhum título encontrado nesta categoria. Personalize os grupos no painel de admin.') :
        'Conecte uma fonte para preencher esta seleção automaticamente.';
      section.append(empty);
    } else {
      const track = document.createElement('div');
      track.className = 'rail-track';
      track.setAttribute('role', 'list');
      for (const item of entries.slice(0, 16)) {
        const card = createCard(item, id, savedMap.get(itemKey(item)));
        card.setAttribute('role', 'listitem');
        track.append(card);
      }
      section.append(track);
    }
    return section;
  }

  function renderHero() {
    const ordered = config.heroMode === 'tv' ? ['tv','movies','series'] :
      config.heroMode === 'series' ? ['series','movies','tv'] : ['movies','series','tv'];
    heroItem = pinnedItem || ordered.map(role =>
      showcase.rails[role].find(item => safeImage(item.logo)) || showcase.rails[role][0]
    ).find(Boolean) || null;
    const title = $('hero-title');
    title.textContent = heroItem ? heroItem.name : config.heroTitle;
    $('hero-subtitle').textContent = heroItem ?
      (heroItem.group || 'Da sua biblioteca') + ' · ' + config.heroSubtitle : config.heroSubtitle;
    $('hero-category').textContent = heroItem ? 'SELECIONADO PARA VOCÊ' : 'BEM-VINDO AO SEU UNIVERSO';
    // O hero mantém o cenário cinematográfico; logos pequenos ficam em um cartão próprio.
    const poster = $('hero-poster');
    const artwork = heroItem && safeImage(heroItem.logo);
    const data = cachedMetadata(heroItem);
    const enriched = data?.status === 'matched' && config.imageEngine !== 'playlist';
    const backdrop = safeImage(config.heroBackdrop);
    const heroArt = $('hero-art');
    if (heroArt) heroArt.src = backdrop ||
      (enriched && (config.imageEngine === 'tmdb' || !artwork) ? data.backdrop || data.poster : '') ||
      artwork || '/assets/login-scene.png';
    if (poster) {
      poster.src = chooseArtwork(artwork, data, config.imageEngine) || '/assets/lux-icon.png';
      poster.referrerPolicy = 'no-referrer';
    }
    $('hero-play').hidden = !heroItem;
    $('hero-add').hidden = !heroItem;
    $('hero-connect').hidden = !!heroItem;
    $('hero-add').textContent = heroItem && favorites.some(x => x.key === itemKey(heroItem)) ? '♥ Na minha lista' : '＋ Minha lista';
  }

  function render() {
    renderHero();
    const availableRecent = recent.map(x => [itemFromKey(x.key), x]).filter(([item]) => !!item);
    const availableFav = favorites.map(x => [itemFromKey(x.key), x]).filter(([item]) => !!item);
    const recentMap = new Map(availableRecent.map(([item, saved]) => [itemKey(item), saved]));
    const rails = {
      continue: { enabled: 'showContinue', list: availableRecent.map(([item]) => item), draw: () =>
        createRail('continue', config.continueTitle, availableRecent.map(([item]) => item), 'RETOME DE ONDE PAROU', recentMap) },
      favorites: { enabled: 'showFavorites', list: availableFav.map(([item]) => item), draw: () =>
        createRail('minha-lista', config.favoritesTitle, availableFav.map(([item]) => item), 'SUA SELEÇÃO') },
      tv: { enabled: 'showTv', list: showcase.rails.tv, draw: () =>
        createRail('destaques-tv', settingsTitle('tv'), showcase.rails.tv, 'AO VIVO · ' + showcase.counts.tv.toLocaleString('pt-BR') + ' TÍTULOS') },
      movies: { enabled: 'showMovies', list: showcase.rails.movies, draw: () =>
        createRail('destaques-filmes', settingsTitle('movies'), showcase.rails.movies, 'PARA DESCOBRIR · ' + showcase.counts.movies.toLocaleString('pt-BR') + ' TÍTULOS') },
      series: { enabled: 'showSeries', list: showcase.rails.series, draw: () =>
        createRail('destaques-series', settingsTitle('series'), showcase.rails.series, 'PARA MARATONAR · ' + showcase.counts.series.toLocaleString('pt-BR') + ' TÍTULOS') }
    };
    const order = config.railOrder === 'favorites' ? ['favorites','continue','tv','movies','series']
      : config.railOrder === 'discovery' ? ['tv','movies','series','continue','favorites']
      : ['continue','favorites','tv','movies','series'];
    const visible = order.filter(key =>
      configRaw[rails[key].enabled] !== false &&
      (configRaw.hideEmpty === false || !items.length || rails[key].list.length));
    railsRoot.replaceChildren(...visible.map(key => rails[key].draw()));
    document.querySelector('.cinema-shell')?.classList.toggle('is-compact', config.density === 'compact');
    $('nav-movies').textContent = settingsTitle('movies');
    $('nav-series').textContent = settingsTitle('series');
    if (items.length && metadataNeeded(config, 'auto')) {
      autoArtRequest(heroItem);
      if (autoEnriched < MAX_AUTO_ENRICH) {
        autoArtRequest(showcase.rails.movies.find(item => !safeImage(item.logo)) || showcase.rails.movies[0]);
        autoArtRequest(showcase.rails.series.find(item => !safeImage(item.logo)) || showcase.rails.series[0]);
      }
    }
    $('catalog-total').textContent = items.length ? items.length.toLocaleString('pt-BR') + ' títulos na biblioteca' : 'Sua biblioteca, seu universo';
  }

  railsRoot.addEventListener('click', event => {
    const fav = event.target.closest('[data-favorite]');
    if (fav) {
      const item = getById(fav.dataset.favorite);
      if (item) toggleFavorite(item);
      return;
    }
    const button = event.target.closest('[data-details]');
    if (button) {
      const item = getById(button.dataset.details);
      if (item) showDetails(item);
    }
  });
  function getById(id) {
    if (!/^c\d+$/.test(String(id))) return null;
    const item = items[Number(id.slice(1))];
    return item?.id === id ? item : null;
  }
  function showDetails(item) {
    if (!item || !detailsDialog) return;
    detailsItem = item;
    $('details-title').textContent = item.name;
    $('details-group').textContent = item.group || 'Disponível na sua biblioteca';
    $('details-kicker').textContent = 'LUX PLAYER · ' + (item.group || 'SUA BIBLIOTECA').slice(0, 62);
    const art = $('details-art');
    if (art) art.src = safeImage(item.logo) || '/assets/login-scene.png';
    const info = $('details-meta');
    const overview = $('details-overview');
    const state = $('details-metadata-status');
    if (info) { info.hidden = true; info.textContent = ''; }
    if (overview) { overview.hidden = true; overview.textContent = ''; }
    if (state) state.textContent = '';
    $('details-favorite').textContent = favorites.some(x => x.key === itemKey(item)) ? '♥ Na minha lista' : '＋ Minha lista';
    openDialog(detailsDialog);
    const needArt = config.imageEngine === 'tmdb' ||
      (config.imageEngine === 'hybrid' && !safeImage(item.logo));
    if (!needArt && config.summaryEngine !== 'tmdb') return;
    if (!queryFor(item)) return;
    if (state) state.textContent = 'Verificando metadados com segurança…';
    void metadataFor(item).then(data => {
      // Evita exibir metadados de outro título se o modal foi trocado/fechado.
      if (detailsItem !== item || !detailsDialog.open) return;
      if (!data || data.status !== 'matched') {
        if (state) state.textContent = 'Sem correspondência confirmada. Exibindo os dados da playlist.';
        return;
      }
      if (art && needArt) art.src = data.backdrop || data.poster || safeImage(item.logo) || '/assets/login-scene.png';
      if (config.summaryEngine === 'tmdb') {
        const label = [data.year, ...(data.genres || []), data.rating ? '★ ' + data.rating : null]
          .filter(Boolean).join('  ·  ');
        if (info && label) { info.textContent = label; info.hidden = false; }
        if (overview && data.overview) { overview.textContent = data.overview; overview.hidden = false; }
      }
      if (state) state.textContent = '';
    }).catch(() => {
      if (detailsItem === item && state) state.textContent = 'Metadados indisponíveis. Exibindo dados da playlist.';
    });
  }
  $('details-close')?.addEventListener('click', () => closeDialog(detailsDialog));
  detailsDialog?.addEventListener('click', event => { if (event.target === detailsDialog) closeDialog(detailsDialog); });
  $('details-play')?.addEventListener('click', () => { const item = detailsItem; closeDialog(detailsDialog); start(item); });
  $('details-favorite')?.addEventListener('click', () => {
    if (!detailsItem) return;
    toggleFavorite(detailsItem);
    $('details-favorite').textContent = favorites.some(x => x.key === itemKey(detailsItem)) ? '♥ Na minha lista' : '＋ Minha lista';
  });
  function start(item) {
    if (!item) return;
    void play(item);
    $('reproduzir').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('hero-play')?.addEventListener('click', () => start(heroItem));
  $('hero-add')?.addEventListener('click', () => heroItem && toggleFavorite(heroItem));

  function toggleFavorite(item) {
    const key = itemKey(item);
    if (favorites.some(x => x.key === key)) favorites = favorites.filter(x => x.key !== key);
    else favorites.unshift(record(item));
    favorites = favorites.slice(0, 60);
    write('favorites', favorites);
    rebuild();
    render();
  }
  function remember(item, position = 0, duration = 0) {
    if (!item) return;
    const key = itemKey(item);
    const previous = recent.find(x => x.key === key);
    const value = record(item, position || previous?.position || 0, duration || previous?.duration || 0);
    recent = [value, ...recent.filter(x => x.key !== key)].slice(0, 30);
    write('recent', recent);
    // A atualização do histórico não reprocessa 260 mil entradas.
    showcase.matches.set(key, item);
  }

  $('admin-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const next = {};
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      next[key] = String($('admin-' + key)?.value || '').trim();
    }
    for (const key of ['showContinue','showFavorites','showTv','showMovies','showSeries','hideEmpty']) {
      next[key] = Boolean($('admin-' + key)?.checked);
    }
    configRaw = next;
    config = normalizeSettings(next);
    write('settings', configRaw);
    rebuild();
    render();
    closeDialog(adminDialog);
  });
  $('admin-export')?.addEventListener('click', async () => {
    const button = $('admin-export');
    // Apenas preferências visuais; nunca inclui playlist, credenciais ou URLs de stream.
    try {
      await navigator.clipboard.writeText(JSON.stringify(configRaw, null, 2));
      if (button) button.textContent = 'Configuração copiada ✓';
    } catch {
      if (button) button.textContent = 'Cópia indisponível';
    }
  });
  $('admin-reset')?.addEventListener('click', () => {
    configRaw = {};
    config = normalizeSettings();
    write('settings', configRaw);
    rebuild();
    render();
    closeDialog(adminDialog);
  });

  render();
  return {
    setItems(next) {
      items = next;
      active = null;
      rebuild();
      render();
      // O formulário original permanece na gaveta; só fecha ao importar com sucesso.
      closeDrawer();
    },
    clear() {
      items = [];
      active = null;
      rebuild();
      render();
    },
    onSelect(item) { active = item; },
    onPlaying(item) {
      if (!item) return;
      active = item;
      remember(item);
      render();
    },
    onProgress(item, position, duration) {
      if (!item || active !== item || !shouldResume(position, duration)) return;
      if (Date.now() - lastProgress < 9000) return;
      lastProgress = Date.now();
      remember(item, position, duration);
    },
    onEnded(item) {
      if (!item) return;
      recent = recent.filter(x => x.key !== itemKey(item));
      write('recent', recent);
      render();
    },
    resumePosition(item) {
      const value = recent.find(x => x.key === itemKey(item));
      return value && shouldResume(value.position, value.duration) ? value.position : 0;
    }
  };
}
