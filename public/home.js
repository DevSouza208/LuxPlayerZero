import { DEFAULT_SETTINGS, normalizeSettings, buildShowcase, itemKey, safeImage, shouldResume } from './home-model.js';

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
    const image = safeImage(item.logo);
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
    heroItem = showcase.rails.movies.find(item => safeImage(item.logo)) ||
      showcase.rails.series.find(item => safeImage(item.logo)) ||
      showcase.rails.tv.find(item => safeImage(item.logo)) ||
      showcase.rails.movies[0] || showcase.rails.series[0] || showcase.rails.tv[0] || null;
    const title = $('hero-title');
    title.textContent = heroItem ? heroItem.name : config.heroTitle;
    $('hero-subtitle').textContent = heroItem ?
      (heroItem.group || 'Da sua biblioteca') + ' · ' + config.heroSubtitle : config.heroSubtitle;
    $('hero-category').textContent = heroItem ? 'SELECIONADO PARA VOCÊ' : 'BEM-VINDO AO SEU UNIVERSO';
    // O hero mantém o cenário cinematográfico; logos pequenos ficam em um cartão próprio.
    const poster = $('hero-poster');
    if (poster) {
      poster.src = heroItem && safeImage(heroItem.logo) ? safeImage(heroItem.logo) : '/assets/lux-icon.png';
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
    railsRoot.replaceChildren(
      createRail('continue', config.continueTitle, availableRecent.map(([item]) => item), 'RETOME DE ONDE PAROU', recentMap),
      createRail('minha-lista', config.favoritesTitle, availableFav.map(([item]) => item), 'SEUS FAVORITOS'),
      createRail('destaques-tv', settingsTitle('tv'), showcase.rails.tv, 'AO VIVO · ' + showcase.counts.tv.toLocaleString('pt-BR') + ' TÍTULOS'),
      createRail('destaques-filmes', settingsTitle('movies'), showcase.rails.movies, 'PARA DESCOBRIR · ' + showcase.counts.movies.toLocaleString('pt-BR') + ' TÍTULOS'),
      createRail('destaques-series', settingsTitle('series'), showcase.rails.series, 'PARA MARATONAR · ' + showcase.counts.series.toLocaleString('pt-BR') + ' TÍTULOS')
    );
    $('nav-movies').textContent = settingsTitle('movies');
    $('nav-series').textContent = settingsTitle('series');
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
    $('details-favorite').textContent = favorites.some(x => x.key === itemKey(item)) ? '♥ Na minha lista' : '＋ Minha lista';
    openDialog(detailsDialog);
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
    configRaw = next;
    config = normalizeSettings(next);
    write('settings', configRaw);
    rebuild();
    render();
    closeDialog(adminDialog);
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
