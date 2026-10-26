import {detailFacts} from './tmdb-rich-view.js';
import {isGuestMode,createGuestStore} from './guest-mode.js';
import {relationIndex,resolveRelations} from './catalog-relations.js';
import {createQuickGuide} from './quick-guide.js';
import { createCatalogSearch } from './catalog-search-client.js';
import { recommendationIndex, recommend, afterWatchRecommendations } from './recommendations.js';
import { DEFAULT_SETTINGS, normalizeSettings, buildShowcase, classifyItem, itemKey, safeImage, shouldResume } from './home-model.js';
import { tmdbQueryForItem, metadataNeeded, chooseArtwork, requestTmdb } from './tmdb-client.js';
import { titleForDisplay } from './cinema-title.js';
import { tagColor } from './lux-tag-palette.js';
import {createEpisodeContinuation} from './episode-continuation.js';
import {buildSeriesIndex,nextEpisode} from './cinema-series.js';
import {groupTvEntries,TV_CATEGORY_LABELS} from './cinema-tv-groups.js';
import {createFullDetails} from './cinema-detail-page.js';
import { genreLabel } from './media-taxonomy.js';
import { browseRoleFromHash, browsePageData, browseGroups, browseFacets } from './cinema-browse.js';

import { createProfileStore } from './profile-store.js';
const $ = id => document.getElementById(id);
const guest=isGuestMode();
let personal;
try { personal = guest?createGuestStore():await createProfileStore(); }
catch { location.replace('/account/'); throw Error('Perfil indisponível'); }
if(guest){
 document.querySelector('.account-link')?.setAttribute('href','/');
 const link=document.querySelector('.account-link');if(link)link.textContent='Entrar na conta';
 const guide=document.querySelector('.guide-link');if(guide)guide.hidden=true;
 const notice=document.createElement('p');notice.className='guest-notice';notice.textContent='Modo visitante · Abra sua lista para explorar. Favoritos e preferências duram apenas enquanto esta página estiver aberta.';
 document.querySelector('main')?.prepend(notice);
 for(const el of document.querySelectorAll('.admin-notice,#admin-save-status'))el.textContent='No modo visitante, alterações ficam apenas nesta página e não são sincronizadas.';
}
const read = (key, fallback) => personal.read(key, fallback);
const write = (key, value) => personal.write(key, value);
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
  let watched = new Set(read('watched', []));
  let seasons = read('seasons', {});
  let showcase = buildShowcase([], config);
  let seriesIndex=buildSeriesIndex([]),tvIndex=groupTvEntries([]);
  let recommendationMap = new Map(), recommendations = [];
  let movieRelations=null,seriesRelations=null;
  let relationSource=null,relationRules='';
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
  // Enriquecer somente títulos visíveis: 10 automáticos por sessão, não os 262 mil.
  // Limite de 3 buscas simultâneas e 8 adicionais reservadas aos detalhes.
  const tmdbResolved = new Map();
  const tmdbPending = new Map();
  const tmdbQueued = new Set();
  const tmdbQueue = [];
  let tmdbCalls = 0;
  let autoEnriched = 0;
  let tmdbInFlight = 0;
  let tmdbEpoch = 0;
  let tmdbReadiness = null;
  const MAX_TMDB_CALLS = 500;
  const MAX_AUTO_ENRICH = 500;
  const MAX_SIMULTANEOUS_TMDB = 3;

  const richCache=new Map(),richPending=new Map();
  async function extendedMetadata(data,target){
    const type=queryFor(target)?.type;if(config.summaryEngine==='off'||data?.status!=='matched'||!data.tmdbId||!type)return null;
    const key=type+':'+data.tmdbId;
    if(richCache.has(key))return richCache.get(key);
    if(richPending.has(key))return richPending.get(key);
    const promise=fetch('/api/metadata/details',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({tmdbId:data.tmdbId,type}),signal:AbortSignal.timeout(15000)})
      .then(async response=>response.ok?response.json():null).catch(()=>null).then(details=>{richCache.set(key,details);return details}).finally(()=>richPending.delete(key));
    richPending.set(key,promise);return promise;
  }
  const fullDetails=createFullDetails({
    onPlay:entry=>start(entry),
    onRelated:entry=>{if(getById(entry?.id)===entry)showDetails(entry);},
    metadataFor:entry=>metadataFor(entry),
    extendedFor:async (data,target)=>{
      const details=await extendedMetadata(data,target);if(!details)return null;
      const index=queryFor(target)?.type==='movie'
        ?(movieRelations??=relationIndex(showcase.catalogs.movies))
        :(seriesRelations??=relationIndex(seriesIndex.representatives,'series'));
      const options={excludeId:data.tmdbId,excludeItem:target};
      const present=rows=>resolveRelations(index,rows,options).filter(row=>getById(row.item.id)===row.item);
      return {...details,collectionItems:present(details.collection?.parts),similarItems:present(details.similar)};
    },
    isFavorite:entry=>favorites.some(row=>row.key===itemKey(entry)),
    onFavorite:entry=>toggleFavorite(entry),
    getSeason:key=>seasons[key],
    onSeason:(key,number)=>{seasons={...seasons,[key]:number};void write('seasons',seasons).catch(error=>flash(error.message,true));},
    getProgress:entry=>recent.find(row=>row.key===itemKey(entry)),
    isWatched:entry=>watched.has(itemKey(entry)),
    onWatched:entry=>markWatched(entry)

  });
  const quickGuide=createQuickGuide($('reproduzir'));
  const continuation=createEpisodeContinuation({host:$('reproduzir'),onPlay:start,onDetails:showDetails,onReturn:()=>fullDetails.resume()});
  const returnButton=document.createElement('button');returnButton.type='button';returnButton.className='lux-return-details';returnButton.textContent='Voltar aos detalhes';returnButton.hidden=true;
  returnButton.addEventListener('click',()=>{continuation.cancel();fullDetails.resume()});$('reproduzir')?.append(returnButton);
  const adminDialog = $('admin-dialog');
  let toastTimeout = null;
  function flash(message, warning = false) {
    const feedback = $('cinema-feedback');
    if (!feedback) return;
    feedback.textContent = message;
    feedback.dataset.warning = warning ? 'true' : 'false';
    feedback.hidden = false;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => { feedback.hidden = true; }, 6500);
  }
  async function tmdbConfigured() {
    try {
      const response = await fetch('/api/metadata/status', {
        credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer'
      });
      if (!response.ok) return false;
      const data = await response.json();
      return data?.configured === true;
    } catch { return false; }
  }
  async function showTmdbStatus() {
    const status = $('admin-tmdb-status');
    if (status) status.textContent = 'Verificando integração privada do TMDB…';
    const configured = await tmdbConfigured();
    if (status) {
      status.textContent = configured ?
        'Chave do TMDB e banco D1 detectados na Cloudflare. Imagens são buscadas sob demanda, com cache e limite de consultas.' :
        'TMDB ainda não configurado neste ambiente: cadastre TMDB_API_KEY como Secret e confirme o binding DB (D1) na Cloudflare Pages.';
      status.dataset.ready = configured ? 'true' : 'false';
    }
    return configured;
  }

  const railsRoot = $('home-rails');
  const browseRoot = $('cinema-browse');
  const browseGrid = $('browse-grid');
  const browseGroupSelect = $('browse-group');
  const tvCategorySelect = $('browse-tv-category');
  const browsePageInput = $('browse-page-input');
  let browseRole = null;
  let browsePage = 1;
  let browseSearch = '';
  let browseGroup = '';
  let browseYear='',browseGenre='',browseLanguage='',browseSort='source',facetSource=null;
  const yearSelect=$('browse-year'),genreSelect=$('browse-genre'),languageSelect=$('browse-language'),sortSelect=$('browse-sort');
  let tvCategory = '', tvCategorySource = null, tvCategoryCache = null;
  let browseLastGroupSource = null;
  let browseLastGroupRole = null;
  let searchCatalog = createCatalogSearch(), remotePage = null, remoteKey = '', requestedKey = '';
  let catalogueEpoch = 0;


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
      if (browseRole) {
        browseSearch = navSearch.value;
        browsePage = 1;
        renderBrowse();
        return;
      }
      const search = $('search');
      if (search) { search.value = navSearch.value; search.dispatchEvent(new Event('input', { bubbles: true })); }
    }, 260);
  });
  navSearch?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      clearTimeout(searchTimer);
      if (browseRole) {
        browseSearch = navSearch.value;
        browsePage = 1;
        renderBrowse();
        return;
      }
      const search = $('search');
      if (search) { search.value = navSearch.value; search.dispatchEvent(new Event('input', { bubbles: true })); }
      $('biblioteca')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  const navLinks = [...document.querySelectorAll('.cinema-nav-link')];
  navLinks.forEach(link => {
    link.addEventListener('click', event => {
      const hash = link.getAttribute('href');
      if (hash === '#inicio' || browseRoleFromHash(hash)) {
        event.preventDefault();
        activateBrowse(browseRoleFromHash(hash), { push: true });
        return;
      }
      navLinks.forEach(el => { el.classList.remove('is-active'); el.removeAttribute('aria-current'); });
      link.classList.add('is-active');
      link.setAttribute('aria-current', 'page');
    });
  });
  window.addEventListener('popstate', () => activateBrowse(browseRoleFromHash(location.hash), { scroll: false }));
  window.addEventListener('hashchange', () => activateBrowse(browseRoleFromHash(location.hash), { scroll: false }));

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
    for (const flag of ['showContinue','showFavorites','showTv','showMovies','showSeries','hideEmpty','personalization','autoNext']) {
      const checkbox = $('admin-' + flag);
      if (checkbox) checkbox.checked = flag==='autoNext'?configRaw[flag]===true:configRaw[flag] !== false;
    }
    openDialog(adminDialog);
    void showTmdbStatus();
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
    return query ? [query.type, query.title.toLocaleLowerCase('pt-BR'), query.year || '', query.tmdbId || ''].join('|') : '';
  }
  function providerArtwork(item) {
    return safeImage(item?.logo) || seriesIndex.byItemId.get(item?.id)?.poster || '';
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
    // Não consultar servidor sem chave/D1: evita uma sequência de erros 503.
    if (!tmdbReadiness) tmdbReadiness = tmdbConfigured();
    if (!await tmdbReadiness || config.imageEngine === 'playlist' && config.summaryEngine !== 'tmdb') return null;
    if (tmdbResolved.has(key)) return tmdbResolved.get(key);
    if (tmdbPending.has(key)) return tmdbPending.get(key);
    if (tmdbCalls >= MAX_TMDB_CALLS) return null;
    tmdbCalls++;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35000);
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
  function pumpTmdbQueue() {
    while (tmdbInFlight < MAX_SIMULTANEOUS_TMDB && tmdbQueue.length) {
      const { item, epoch } = tmdbQueue.shift();
      if (epoch !== tmdbEpoch) continue;
      tmdbInFlight++;
      void metadataFor(item).then(data => {
        if (!data || epoch !== tmdbEpoch) return;
        const index = Number(String(item.id || '').slice(1));
        if (items[index] === item) render();
      }).finally(() => {
        tmdbInFlight--;
        pumpTmdbQueue();
      });
    }
  }
  function autoArtRequest(item) {
    if (!item || autoEnriched >= MAX_AUTO_ENRICH ||
      config.imageEngine === 'playlist') return;
    const query = queryFor(item);
    if (!query) return;
    const key = keyForQuery(query);
    if (tmdbQueued.has(key) || tmdbPending.has(key) || tmdbResolved.has(key)) return;
    tmdbQueued.add(key);
    autoEnriched++;
    tmdbQueue.push({ item, epoch: tmdbEpoch });
    pumpTmdbQueue();
  }
  function itemFromKey(key) { return showcase.matches.get(key); }
  function savedKeys() { return [...new Set([...favorites, ...recent].map(x => x.key))]; }
  function rebuild() {
    showcase = buildShowcase(items, config, savedKeys());
    seriesIndex=buildSeriesIndex(showcase.catalogs.series);
    tvIndex=groupTvEntries(showcase.catalogs.tv);
    const rules=JSON.stringify([config.tvKeywords,config.moviesKeywords,config.seriesKeywords]);
    if(relationSource!==items||relationRules!==rules){
      movieRelations=null;seriesRelations=null;relationSource=items;relationRules=rules;
    }
    tvCategorySource=null;tvCategoryCache=null;
    recommendationMap = recommendationIndex(items);
    updateRecommendations();
    pinnedItem = config.heroMode === 'pinned' && config.pinnedName
      ? items.find(item => item.name === config.pinnedName || titleForDisplay(item) === config.pinnedName) || null : null;
  }

  // Catálogos completos em páginas: usa referências do mesmo índice do showcase
  // (zero novo parsing e só 48 elementos DOM por página).
  function updateRecommendations() {
    const seeds = [...recent, ...favorites].map(row => itemFromKey(row.key)).filter(Boolean).slice(0,5);
    recommendations = recommend(recommendationMap, seeds, {
      watched: new Set([...watched,...recent.map(row => row.key)]), enabled: configRaw.personalization !== false
    });
  }
  function browseSource(role) {
    if (role === 'favorites') return favorites.map(entry => itemFromKey(entry.key)).filter(Boolean);
    if(role==='series')return seriesIndex.representatives;
    if(role==='tv'){
      if(!tvCategory)return tvIndex.representatives;
      if(tvCategoryCache?.groups===tvIndex.groups&&tvCategoryCache.category===tvCategory)
        return tvCategoryCache.items;
      const selected=tvIndex.groups.filter(row=>row.category===tvCategory).map(row=>row.primary);
      tvCategoryCache={groups:tvIndex.groups,category:tvCategory,items:selected};
      return selected;
    }
    return showcase.catalogs?.[role] || [];
  }
  function activateBrowse(nextRole, options = {}) {
    if (!browseRoot) return;
    const valid = ['tv', 'movies', 'series', 'favorites'].includes(nextRole) ? nextRole : null;
    if (valid !== browseRole) {
      browseSearch = '';
      browseGroup = '';
      tvCategory = '';browseYear=browseGenre=browseLanguage='';browseSort='source';facetSource=null;if(sortSelect)sortSelect.value='source';
      browsePage = 1;
      browseLastGroupSource = null;
      browseLastGroupRole = null;
      if (navSearch) navSearch.value = '';
    }
    browseRole = valid;
    const path = valid === 'tv' ? '#destaques-tv' : valid === 'movies' ? '#destaques-filmes'
      : valid === 'series' ? '#destaques-series' : valid === 'favorites' ? '#minha-lista' : '#inicio';
    if (options.push && window.location.hash !== path) {
      history.pushState(null, '', path);
    }
    browseRoot.hidden = !valid;
    document.querySelector('.cinema-shell')?.classList.toggle('is-browsing', Boolean(valid));
    navLinks.forEach(link => {
      const selected = link.getAttribute('href') === path;
      link.classList.toggle('is-active', selected);
      if (selected) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    if (valid) renderBrowse();
    if (options.scroll !== false) window.scrollTo(0, 0);
  }
  function renderBrowse() {
    if(!browseRole||!browseGrid)return;
    if(tvCategorySelect){
      tvCategorySelect.parentElement.hidden=browseRole!=='tv';
      if(browseRole==='tv'&&tvCategorySource!==tvIndex.groups){
        tvCategorySource=tvIndex.groups;
        const counts=new Map();
        for(const channel of tvIndex.groups)counts.set(channel.category,(counts.get(channel.category)||0)+1);
        const all=document.createElement('option');all.value='';all.textContent='Todas as categorias';
        const options=[all];
        for(const [name,label] of Object.entries(TV_CATEGORY_LABELS)){
          if(!counts.get(name))continue;
          const option=document.createElement('option');option.value=name;
          option.textContent=label+' ('+counts.get(name).toLocaleString('pt-BR')+')';options.push(option);
        }
        tvCategorySelect.replaceChildren(...options);
        tvCategorySelect.value=tvCategory;
      }
    }
    const source = browseSource(browseRole);
    if(facetSource!==source){
      facetSource=source;const facets=browseFacets(source);
      if(browseYear&&!facets.years.map(String).includes(browseYear))browseYear='';
      if(browseGenre&&!facets.genres.includes(browseGenre))browseGenre='';
      if(browseLanguage&&!facets.languages.includes(browseLanguage))browseLanguage='';
      for(const [select,values,label,selected,format] of [[yearSelect,facets.years,'Todos os anos',browseYear,String],[genreSelect,facets.genres,'Todos os gêneros',browseGenre,genreLabel],[languageSelect,facets.languages,'Todos',browseLanguage,String]]){
        if(!select)continue;const all=document.createElement('option');all.value='';all.textContent=label;
        select.replaceChildren(all,...values.map(value=>{const option=document.createElement('option');option.value=String(value);option.textContent=format(value);return option}));select.value=selected;
      }
    }

    const title = browseRole === 'tv' ? (configRaw.tvTitle ? settingsTitle('tv') : 'Ao vivo')
      : browseRole === 'movies' ? (configRaw.moviesTitle ? settingsTitle('movies') : 'Filmes')
      : browseRole === 'series' ? (configRaw.seriesTitle ? settingsTitle('series') : 'Séries')
      : config.favoritesTitle;
    $('browse-title').textContent = title;
    browseGrid.dataset.role = browseRole;

    // O filtro de grupos muda só quando a categoria/índice muda.
    if (browseGroupSelect && (browseLastGroupRole !== browseRole || browseLastGroupSource !== source)) {
      browseLastGroupRole = browseRole;
      browseLastGroupSource = source;
      const all = document.createElement('option');
      all.value = '';
      all.textContent = 'Todos os grupos';
      const options = [all];
      if (browseRole !== 'favorites') {
        for (const [group, count] of browseGroups(source)) {
          const option = document.createElement('option');
          option.value = group;
          option.textContent = group + ' (' + count.toLocaleString('pt-BR') + ')';
          options.push(option);
        }
      }
      browseGroupSelect.replaceChildren(...options);
      browseGroupSelect.value = browseGroup;
      browseGroupSelect.parentElement.hidden = browseRole === 'favorites';
    }
    const requestKey = [catalogueEpoch,browseRole,browseSearch,browsePage,browseGroup,browseYear,browseGenre,browseLanguage,browseSort].join('|');
    if(browseRole==='movies' && browseSearch && !browseGroup && !browseYear && !browseGenre && !browseLanguage && browseSort==='source' && requestedKey!==requestKey){
      requestedKey=requestKey;
      void searchCatalog(browseSearch,browsePage,items).then(result=>{
        if(requestedKey!==requestKey || !result)return;
        remotePage=result;remoteKey=requestKey;renderBrowse();
      });
    }
    const page = remoteKey===requestKey && remotePage ? remotePage : browsePageData(source, {
      page: browsePage, query: browseSearch, group: browseGroup,year:browseYear,genre:browseGenre,language:browseLanguage,sort:browseSort
    });
    browsePage = page.page;
    $('browse-page-label').textContent = 'Página ' + page.page.toLocaleString('pt-BR') +
      ' de ' + page.pageCount.toLocaleString('pt-BR') + ' · ' + page.total.toLocaleString('pt-BR') + ' títulos';
    browsePageInput.value = String(page.page);
    browsePageInput.max = String(page.pageCount);
    $('browse-filter-label').textContent = browseSearch || browseGroup || browseYear || browseGenre || browseLanguage
      ? page.total.toLocaleString('pt-BR') + ' títulos encontrados'
      : source.length.toLocaleString('pt-BR') + ' títulos disponíveis';
    $('browse-foot-count').textContent = page.start + '–' + page.end +
      ' de ' + page.total.toLocaleString('pt-BR');
    for (const button of browseRoot.querySelectorAll('[data-browse-page]')) {
      const direction = button.dataset.browsePage;
      button.disabled = direction === 'first' || direction === 'prev'
        ? page.page <= 1 : page.page >= page.pageCount;
    }
    if (!page.entries.length) {
      const empty = document.createElement('div');
      empty.className = 'browse-empty';
      appendText(empty, 'strong', '', items.length ? 'Nenhum título encontrado.' : 'Sua biblioteca começa aqui.');
      appendText(empty, 'span', '', items.length ? 'Experimente outra busca ou grupo.' : 'Conecte sua playlist para explorar os títulos.');
      if (!items.length) {
        const button = appendText(empty, 'button', '', '＋ Conectar fonte');
        button.type = 'button';
        button.dataset.browseConnect = 'true';
      }
      browseGrid.replaceChildren(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const item of page.entries) {
      const card = createCard(item, browseRole);
      const visual = card.querySelector('.media-visual');
      if (visual) {
        const badges = appendText(visual, 'span', 'browse-badges', '');
        const badge = appendText(badges, 'span', 'browse-badge',
          browseRole === 'tv' ? 'AO VIVO' : browseRole === 'movies' ? 'FILME' :
          browseRole === 'series' ? 'SÉRIE' : 'MINHA LISTA');
        badge.setAttribute('aria-hidden', 'true');
        for (const tag of (item.catalogTags || []).filter(tag => tag === 'Dublado' || tag === 'Legendado')) {
          appendText(badges, 'span', 'browse-badge browse-audio-badge', tag);
        }
      }
      const favorite = card.querySelector('.media-favorite');
      if (favorite) favorite.textContent = (favorites.some(entry => entry.key === itemKey(item)) ? '♥' : '＋') + ' Minha lista';
      fragment.append(card);
    }
    browseGrid.replaceChildren(fragment);
    // Buscar capas da página aberta; deduplicar e limitar concorrência.
    if (metadataNeeded(config, 'auto')) {
      for (const item of page.entries) autoArtRequest(item);
    }
  }
  tvCategorySelect?.addEventListener('change',()=>{
    tvCategory=tvCategorySelect.value;browseGroup='';browsePage=1;
    browseLastGroupSource=null;renderBrowse();
  });
  for(const select of [yearSelect,genreSelect,languageSelect,sortSelect])select?.addEventListener('change',()=>{
    browseYear=yearSelect.value;browseGenre=genreSelect.value;browseLanguage=languageSelect.value;browseSort=sortSelect.value;browsePage=1;renderBrowse();
  });
  browseGroupSelect?.addEventListener('change', () => {
    browseGroup = browseGroupSelect.value;
    browsePage = 1;
    renderBrowse();
  });
  browseRoot?.addEventListener('click', event => {
    const button = event.target.closest('[data-browse-page]');
    if (button) {
      const action = button.dataset.browsePage;
      const count = Number(browsePageInput.max) || 1;
      browsePage = action === 'first' ? 1 : action === 'last' ? count
        : Math.max(1, Math.min(count, browsePage + (action === 'next' ? 1 : -1)));
      renderBrowse();
      window.scrollTo(0, 0);
      return;
    }
    if (event.target.closest('[data-browse-connect]')) { openDrawer(); return; }
    const fav = event.target.closest('[data-favorite]');
    if (fav) {
      const item = getById(fav.dataset.favorite);
      if (item) toggleFavorite(item);
      return;
    }
    const details = event.target.closest('[data-details]');
    if (details) {
      const item = getById(details.dataset.details);
      if (item) showDetails(item);
    }
  });
  function browseGoToPage() {
    browsePage = Number(browsePageInput?.value || 1);
    renderBrowse();
    window.scrollTo(0, 0);
  }
  $('browse-page-go')?.addEventListener('click', browseGoToPage);
  browsePageInput?.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); browseGoToPage(); }
  });
  $('browse-top')?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  function createCard(item, category, saved = null) {
    const card = document.createElement('article');
    card.className = 'media-card';
    const visual = document.createElement('button');
    visual.type = 'button';
    visual.className = 'media-visual';
    visual.dataset.details = item.id;
    visual.setAttribute('aria-label', 'Ver detalhes de ' + titleForDisplay(item));
    const image = chooseArtwork(providerArtwork(item), cachedMetadata(item), config.imageEngine);
    if (image) {
      const img = document.createElement('img');
      img.src = image;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => {
        const reserve=providerArtwork(item);
        if(reserve && img.src!==reserve){img.src=reserve;return;}
        img.remove();
      });
      visual.append(img);
    }
    const monogram = document.createElement('span');
    monogram.className = 'media-monogram';
    monogram.textContent = (titleForDisplay(item) || 'L').slice(0, 1).toUpperCase();
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
    appendText(labels, 'span', 'media-title', titleForDisplay(item));
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
    if (item.catalogYear) appendText(info, 'span', 'media-group', String(item.catalogYear));
    const tags=(item.catalogTags||[]).filter(tag=>tag!=='Dublado' && tag!=='Legendado').slice(0,3);
    if(tags.length){
      const strip=appendText(info,'div','lux-tag-strip','');
      for(const tag of tags){
        const badge=appendText(strip,'span','lux-media-tag',tag),color=tagColor(tag);
        badge.style.color=color.solid;
        badge.style.background=color.soft;
        badge.style.borderColor=color.solid;
      }
    }
    if(classifyRole(item)==='tv'){
      const group=tvIndex.byItemId.get(item.id);
      if(group?.variantCount>1)appendText(info,'span','lux-tv-variant-count',
        group.variantCount+' fontes disponíveis');
    }
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

  $('hero-details')?.addEventListener('click',()=>showDetails(heroItem));
  function renderHero() {
    const ordered = config.heroMode === 'tv' ? ['tv','movies','series'] :
      config.heroMode === 'series' ? ['series','movies','tv'] : ['movies','series','tv'];
    heroItem = pinnedItem || ordered.map(role =>
      showcase.rails[role].find(item => safeImage(item.logo)) || showcase.rails[role][0]
    ).find(Boolean) || null;
    const title = $('hero-title');
    title.textContent = heroItem ? titleForDisplay(heroItem) : config.heroTitle;
    $('hero-subtitle').textContent = heroItem ?
      (heroItem.group || 'Da sua biblioteca') + ' · ' + config.heroSubtitle : config.heroSubtitle;
    $('hero-category').textContent = heroItem ? 'SELECIONADO PARA VOCÊ' : 'BEM-VINDO AO SEU UNIVERSO';
    // O hero mantém o cenário cinematográfico; logos pequenos ficam em um cartão próprio.
    const poster = $('hero-poster');
    const artwork = heroItem && providerArtwork(heroItem);
    const data = cachedMetadata(heroItem);
    const enriched = data?.status === 'matched' && config.imageEngine !== 'playlist';
    const richKey=data?.tmdbId?queryFor(heroItem)?.type+':'+data.tmdbId:'';
    const rich=richCache.get(richKey);
    const description=rich?.overview||data?.overview;
    if(description){$('hero-subtitle').textContent=description;$('hero-subtitle').classList.add('hero-overview');}
    else $('hero-subtitle').classList.remove('hero-overview');
    const facts=$('hero-facts');if(facts){const values=rich?detailFacts(rich):data?[data.year,...(data.genres||[]),data.rating?'★ '+data.rating:null].filter(Boolean):[];facts.textContent=values.join(' · ');facts.hidden=!values.length;}
    const tagline=$('hero-tagline');if(tagline){tagline.textContent=rich?.tagline||'';tagline.hidden=!rich?.tagline;}
    if(data?.status==='matched'&&!richCache.has(richKey)&&!richPending.has(richKey)){
      const selected=heroItem;void extendedMetadata(data,selected).then(()=>{if(heroItem===selected)renderHero()});
    }
    if($('hero-details'))$('hero-details').hidden=!heroItem;
    const backdrop = safeImage(config.heroBackdrop);
    const heroArt = $('hero-art');
    // Logos de canal são pequenas e quadradas; nunca esticá-las como hero panorâmico.
    // Somente backdrop TMDB confirmado ou imagem panorâmica explicitamente escolhida.
    if (heroArt) {
      heroArt.src = backdrop ||
        (enriched && data.backdrop ? data.backdrop : '') || '/assets/login-scene.png';
      heroArt.referrerPolicy = 'no-referrer';
    }
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
      tv: { enabled: 'showTv', list: tvIndex.representatives.slice(0,16), draw: () =>
        createRail('destaques-tv', settingsTitle('tv'), tvIndex.representatives.slice(0,16),
          'AO VIVO · ' + tvIndex.representatives.length.toLocaleString('pt-BR') + ' CANAIS') },
      movies: { enabled: 'showMovies', list: showcase.rails.movies, draw: () =>
        createRail('destaques-filmes', settingsTitle('movies'), showcase.rails.movies, 'PARA DESCOBRIR · ' + showcase.counts.movies.toLocaleString('pt-BR') + ' TÍTULOS') },
      series: { enabled: 'showSeries', list: seriesIndex.representatives.slice(0,16), draw: () =>
        createRail('destaques-series', settingsTitle('series'), seriesIndex.representatives.slice(0,16),
          'PARA MARATONAR · ' + seriesIndex.representatives.length.toLocaleString('pt-BR') + ' SÉRIES') }
    };
    const order = config.railOrder === 'favorites' ? ['favorites','continue','tv','movies','series']
      : config.railOrder === 'discovery' ? ['tv','movies','series','continue','favorites']
      : ['continue','favorites','tv','movies','series'];
    const visible = order.filter(key =>
      configRaw[rails[key].enabled] !== false &&
      (configRaw.hideEmpty === false || !items.length || rails[key].list.length));
    railsRoot.replaceChildren(...visible.map(key => rails[key].draw()));
    const lastTv=availableRecent.find(([item])=>classifyRole(item)==='tv')?.[0];
    if(lastTv){
      const last=document.createElement('button');last.type='button';last.className='lux-last-channel';
      last.textContent='Voltar ao último canal · '+titleForDisplay(lastTv);
      last.addEventListener('click',()=>start(lastTv));railsRoot.prepend(last);
    }

    if (recommendations.length) railsRoot.append(createRail('recommendations', 'Para você',
      recommendations.map(row => row.item), 'Porque você assistiu ou salvou ' + recommendations[0].reason));
    document.querySelector('.cinema-shell')?.classList.toggle('is-compact', config.density === 'compact');
    $('nav-movies').textContent = configRaw.moviesTitle ? settingsTitle('movies') : 'Filmes';
    $('nav-series').textContent = configRaw.seriesTitle ? settingsTitle('series') : 'Séries';
    if (items.length && metadataNeeded(config, 'auto')) {
      // Priorizar o banner e as primeiras capas realmente visíveis.
      // Os demais títulos recebem metadados se o usuário abrir Detalhes.
      autoArtRequest(heroItem);
      const visible = [...showcase.rails.movies.slice(0, 7), ...seriesIndex.representatives.slice(0, 7)];
      for (const item of visible) {
        if (autoEnriched >= MAX_AUTO_ENRICH) break;
        autoArtRequest(item);
      }
    }
    $('catalog-total').textContent = items.length ? items.length.toLocaleString('pt-BR') + ' títulos na biblioteca' : 'Sua biblioteca, seu universo';
    if (browseRole) renderBrowse();
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
    if(!item)return;
    const role=classifyRole(item);
    if(role==='movies'||role==='series'){
      const found=role==='series'?seriesIndex.byItemId.get(item.id):null;
      const metadata=cachedMetadata(item);
      fullDetails.open(item,{series:found,
        poster:chooseArtwork(providerArtwork(item),metadata,config.imageEngine),
        fallbackPoster:providerArtwork(item),
        backdrop:metadata?.backdrop||''});
      return;
    }
    if(!detailsDialog)return;
    detailsItem=item;
    const variants=tvIndex.byItemId.get(item.id)?.variants||[];
    const picker=$('details-variants'),select=$('details-variant-select');
    if(picker&&select){
      picker.hidden=variants.length<2;select.replaceChildren();
      for(const variant of variants){
        const option=document.createElement('option');option.value=variant.item.id;
        option.textContent=variant.label+' · '+variant.item.name;select.append(option);
      }
      select.value=tvIndex.byItemId.get(item.id)?.primary?.id||item.id;
    }
    $('details-title').textContent = titleForDisplay(item);
    $('details-group').textContent = [item.normalizedGroup || item.group || 'Disponível na sua biblioteca',
      item.catalogYear].filter(Boolean).join(' · ');
    const tagRoot=$('details-tags');
    if(tagRoot){
      tagRoot.replaceChildren();
      for(const tag of (item.catalogTags||[]).filter(tag=>tag!=='Dublado').slice(0,12)){
        const badge=appendText(tagRoot,'span','lux-media-tag',tag),color=tagColor(tag);
        badge.style.color=color.solid;
        badge.style.background=color.soft;
        badge.style.borderColor=color.solid;
      }
    }
    $('details-kicker').textContent = 'LUX PLAYER · ' + (item.group || 'SUA BIBLIOTECA').slice(0, 62);
    const art = $('details-art');
    const logo = safeImage(item.logo);
    if (art) art.src = '/assets/login-scene.png';
    const detailPoster = $('details-poster');
    const detailPosterFallback = $('details-poster-fallback');
    if (detailPoster) { detailPoster.hidden = !logo; if (logo) detailPoster.src = logo; }
    if (detailPosterFallback) detailPosterFallback.hidden = !!logo;
    const info = $('details-meta');
    const overview = $('details-overview');
    const state = $('details-metadata-status');
    if (info) { info.hidden = true; info.textContent = ''; }
    if (overview) { overview.hidden = true; overview.textContent = ''; }
    if (state) state.textContent = '';
    $('details-favorite').textContent = favorites.some(x => x.key === itemKey(item)) ? '♥ Na minha lista' : '＋ Minha lista';
    openDialog(detailsDialog);
    const needArt = config.imageEngine !== 'playlist';
    if (!needArt && config.summaryEngine !== 'tmdb') return;
    if (!queryFor(item)) return;
    if (state) state.textContent = 'Verificando metadados com segurança…';
    void metadataFor(item).then(async data => {
      // Evita exibir metadados de outro título se o modal foi trocado/fechado.
      if (detailsItem !== item || !detailsDialog.open) return;
      if (!data || data.status !== 'matched') {
        if (state) state.textContent = await tmdbReadiness === false
          ? 'TMDB indisponível: verifique a chave no painel de administração. Mantendo a capa da playlist.'
          : 'Nenhuma correspondência segura por título, ano ou ID. Mantendo a capa da playlist.';
        return;
      }
      if (art && needArt && data.backdrop) art.src = data.backdrop;
      if (detailPoster && needArt && data.poster) { detailPoster.src = data.poster; detailPoster.hidden = false; if (detailPosterFallback) detailPosterFallback.hidden = true; }
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
  $('details-play')?.addEventListener('click',()=>{
    const item=detailsItem,variants=item?tvIndex.byItemId.get(item.id)?.variants:null;
    const selectedId=$('details-variant-select')?.value;
    const selected=variants?.find(row=>row.item.id===selectedId)?.item||item;
    closeDialog(detailsDialog);start(selected);
  });
  $('details-favorite')?.addEventListener('click', () => {
    if (!detailsItem) return;
    toggleFavorite(detailsItem);
    $('details-favorite').textContent = favorites.some(x => x.key === itemKey(detailsItem)) ? '♥ Na minha lista' : '＋ Minha lista';
  });
  function start(item) {
    if (!item) return;
    continuation.cancel();returnButton.hidden=!fullDetails.canResume();
    if (browseRole) activateBrowse(null, { push: true, scroll: false });
    void play(item);
    $('reproduzir').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('hero-play')?.addEventListener('click', () => start(heroItem));
  $('hero-add')?.addEventListener('click', () => heroItem && toggleFavorite(heroItem));

  async function markWatched(item) {
    const key=itemKey(item),before=new Set(watched);
    if(watched.has(key))watched.delete(key);else watched.add(key);
    try{await write('watched',[...watched]);updateRecommendations();render();}
    catch(error){watched=before;flash(error.message,true);}
  }
  async function toggleFavorite(item) {
    const before = favorites;
    const key = itemKey(item);
    if (favorites.some(x => x.key === key)) {
      favorites = favorites.filter(x => x.key !== key);
      if (!recent.some(entry => entry.key === key)) showcase.matches.delete(key);
    } else {
      favorites.unshift(record(item));
      // Favoritar não requer reclassificar os 262 mil registros.
      showcase.matches.set(key, item);
    }
    favorites = favorites.slice(0, 60);
    try { await write('favorites', favorites); }
    catch (error) { favorites = before; rebuild(); flash(error.message, true); }
    updateRecommendations();
    render();
  }
  function remember(item, position = 0, duration = 0) {
    if (!item) return;
    const key = itemKey(item);
    const previous = recent.find(x => x.key === key);
    const value = record(item, position || previous?.position || 0, duration || previous?.duration || 0);
    recent = [value, ...recent.filter(x => x.key !== key)].slice(0, 30);
    void write('recent', recent).catch(error => flash(error.message, true));
    // A atualização do histórico não reprocessa 260 mil entradas.
    showcase.matches.set(key, item);
    updateRecommendations();
  }

  $('admin-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const next = {};
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      next[key] = String($('admin-' + key)?.value || '').trim();
    }
    for (const key of ['showContinue','showFavorites','showTv','showMovies','showSeries','hideEmpty','personalization','autoNext']) {
      next[key] = Boolean($('admin-' + key)?.checked);
    }
    // Salvar deve realmente funcionar; em caso de storage bloqueado, não fingir sucesso.
    if (!await write('settings', next).catch(error => { flash(error.message, true); return false; })) {
      flash('Não foi possível sincronizar. Confira a conexão e recarregue antes de tentar novamente.', true);
      const status = $('admin-save-status');
      if (status) status.textContent = 'Falha ao salvar: armazenamento indisponível.';
      return;
    }
    const imageModeChanged = next.imageEngine !== configRaw.imageEngine ||
      next.summaryEngine !== configRaw.summaryEngine;
    continuation.cancel();configRaw = next;
    config = normalizeSettings(next);
    if (imageModeChanged) {
      tmdbCalls = 0;
      autoEnriched = 0;
      tmdbEpoch++;
      tmdbQueued.clear();
      tmdbQueue.length = 0;
      tmdbReadiness = null;
      tmdbResolved.clear();
    }
    rebuild();
    render();
    closeDialog(adminDialog);
    flash(guest?'✓ Personalização aplicada nesta página.':'✓ Personalização aplicada e salva no seu perfil.');
    const wantsTmdb = config.imageEngine !== 'playlist' || config.summaryEngine === 'tmdb';
    if (wantsTmdb) {
      void tmdbConfigured().then(ready => {
        flash(ready ?
          '✓ Personalização aplicada e salva. TMDB configurado; capas serão carregadas conforme houver correspondências.' :
          '✓ Personalização aplicada e salva. TMDB precisa da chave TMDB_API_KEY e D1 na Cloudflare para carregar imagens.',
          !ready);
      });
    }
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
  // Atalhos editoriais sem tocar em streams, catálogo ou segredos.
  // A escolha apenas preenche o formulário; alterações só valem após Salvar.
  const presets = {
    streaming: {
      tvTitle: 'Ao vivo agora', moviesTitle: 'Filmes para você',
      seriesTitle: 'Séries para maratonar',
      tvKeywords: 'TV, Canais, Esportes, Notícias',
      moviesKeywords: 'Filmes, Cinema, Lançamentos, VOD',
      seriesKeywords: 'Séries, Temporadas, Episódios'
    },
    courses: {
      tvTitle: 'Aulas ao vivo', moviesTitle: 'Cursos disponíveis',
      seriesTitle: 'Módulos e trilhas',
      tvKeywords: 'Lives, Ao vivo, Webinars',
      moviesKeywords: 'Cursos, Formação, Treinamento',
      seriesKeywords: 'Módulos, Aulas, Lições'
    },
    generic: {
      tvTitle: 'Assista agora', moviesTitle: 'Para descobrir',
      seriesTitle: 'Explore sua biblioteca',
      tvKeywords: '', moviesKeywords: '', seriesKeywords: ''
    }
  };
  document.querySelectorAll('[data-admin-preset]').forEach(button => {
    button.addEventListener('click', () => {
      const preset = presets[button.dataset.adminPreset];
      if (!preset) return;
      for (const [key, value] of Object.entries(preset)) {
        const field = $('admin-' + key);
        if (field) field.value = value;
      }
      document.querySelectorAll('[data-admin-preset]').forEach(other => {
        other.setAttribute('aria-pressed', String(other === button));
      });
      const message = $('admin-preset-status');
      if (message) message.textContent = 'Modelo preenchido. Clique em Salvar personalização para aplicar.';
    });
  });
  $('admin-reset')?.addEventListener('click', async () => {
    try { await write('settings', {}); } catch(error) { flash(error.message,true); return; }
    configRaw = {};
    config = normalizeSettings();

    rebuild();
    render();
    closeDialog(adminDialog);
  });

  render();
  // Links diretos /cinema/#destaques-filmes etc. também abrem a página completa.
  activateBrowse(browseRoleFromHash(location.hash), { scroll: false });
  return {
    tvVariants(entry){return tvIndex.byItemId.get(entry?.id)?.variants||[]},
    playbackTitle(entry){
      const group=seriesIndex.byItemId.get(entry?.id);
      const row=group?.episodes.find(value=>value.item===entry);
      return row?group.title+' · T'+row.season+':E'+row.number:
        (entry?.displayName||entry?.name||'');
    },
    resumeDetails(){return fullDetails.resume()},
    backdropFor(entry){const value=cachedMetadata(entry);return safeImage(value?.backdrop||value?.poster||providerArtwork(entry))},
    setItems(next) {
      quickGuide.select(null);continuation.cancel();
      // Descarta buscas automáticas pendentes da biblioteca anterior.
      tmdbEpoch++;
      tmdbQueue.length = 0;
      tmdbQueued.clear();
      autoEnriched = 0;
      catalogueEpoch++;searchCatalog=createCatalogSearch();requestedKey=remoteKey='';remotePage=null;
      items=next;
      active=null;rebuild();
      render();
      // O formulário original permanece na gaveta; só fecha ao importar com sucesso.
      closeDrawer();
    },
    clear() {
      tmdbEpoch++;
      tmdbQueue.length = 0;
      tmdbQueued.clear();
      autoEnriched = 0;
      quickGuide.select(null);continuation.cancel();returnButton.hidden=true;
      items=[];seriesIndex=buildSeriesIndex([]);tvIndex=groupTvEntries([]);
      active = null;
      rebuild();
      render();
    },
    onSelect(item) { quickGuide.select(classifyRole(item)==='tv'?item:null);continuation.cancel();returnButton.hidden=!fullDetails.canResume();active = item; },
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
      watched.add(itemKey(item));
      void write('watched',[...watched]).catch(error=>flash(error.message,true));
      recent = recent.filter(x => x.key !== itemKey(item));
      void write('recent', recent).catch(error => flash(error.message, true));
      updateRecommendations();
      render();
      const group=seriesIndex.byItemId.get(item.id);
      const next=group?nextEpisode(seriesIndex,item):null;
      if(next)continuation.show(next,configRaw.autoNext===true);
      else if(classifyRole(item)!=='tv'){
        const enabled=configRaw.personalization!==false;
        continuation.showRecommendations(afterWatchRecommendations(recommendationMap,item,seriesIndex,{watched,enabled}),{series:Boolean(group),enabled});
      }
    },
    resumePosition(item) {
      const value = recent.find(x => x.key === itemKey(item));
      return value && shouldResume(value.position, value.duration) ? value.position : 0;
    }
  };
}
