/* Lux Cinema: interface pública e capas visíveis. Catálogos, APIs e streams não entram neste cache. */
const VERSION = 'lux-cinema-shell-63';
const ASSETS = [
  '/local-data.js', '/profile-sync-model.js', '/library-cache.js', '/player-visibility.js', '/playback-errors.js',
  '/legal/links.css',
  '/catalog-prepare.js', '/catalog-prepare-worker.js', '/presentation-metadata.js', '/episode-metadata.js', '/vod-admin.js', '/vod-model.js', '/lux-icons.js', '/lux-icons.css',
  '/player-controls.js', '/player-modal.js', '/artwork-preload.js', '/artwork-metadata-cache.js', '/tmdb-rich-view.js', '/trailer-modal.js', '/guest-mode.js', '/catalog-relations.js', '/quick-guide.js', '/guide-model.js', '/catalog-navigation.js', '/connectivity.js', '/connectivity.css', '/style.css', '/home.css', '/cinema-premium.css', '/cinema-polish.css', '/cinema-browse.css',
  '/cinema-app.js', '/home.js', '/episode-continuation.js', '/home-model.js', '/cinema-browse.js', '/tmdb-client.js', '/cinema-tmdb-tags.js', '/cinema-title.js', '/media-taxonomy.js', '/tv-normalizer.js', '/profile-store.js', '/recommendations.js', '/catalog-search-client.js', '/cinema-series.js', '/cinema-tv-groups.js', '/cinema-detail-page.js', '/cinema-detail-page.css', '/lux-tag-palette.js', '/lux-tag-palette.css', '/saved-catalog.js', '/catalog-cache.js',
  '/playlist.js', '/gateway.js', '/direct-source.js',
  '/assets/lux-cursor.svg', '/assets/lux-cursor-active.svg', '/assets/lux-icon.png', '/assets/lux-logo.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(
      names.filter(name => name.startsWith('lux-cinema-shell-') && name !== VERSION)
        .map(name => caches.delete(name))
    )).then(() => self.clients.claim())
  );
});

const isPublicAsset = url => url.origin === self.location.origin &&
  ASSETS.includes(url.pathname) && !url.search;

const ART_CACHE = 'lux-cinema-artwork-v1';
const ART_LIMIT = 600;
const isArtwork = (request, url) => request.destination === 'image' &&
  url.protocol === 'https:' && !url.username && !url.password && !url.search &&
  (url.hostname === 'image.tmdb.org' || /\.(?:jpe?g|png|webp|avif)$/i.test(url.pathname));
let artWrites = Promise.resolve();
async function cachedArtwork(request) {
  const cache = await caches.open(ART_CACHE);
  const saved = await cache.match(request);
  if (saved) return saved;
  // Respostas legíveis evitam guardar erros opacos e a cota inflada dessas imagens.
  let response;
  try { response = await fetch(new Request(request, {mode:'cors', credentials:'omit'})); }
  catch { return fetch(request); }
  if (response.ok) {
    const copy = response.clone();
    const write = artWrites.then(async () => {
      await cache.put(request, copy);
      const keys = await cache.keys();
      for (const key of keys.slice(0, Math.max(0, keys.length - ART_LIMIT))) await cache.delete(key);
    }).catch(() => {});
    artWrites = write;
    await write;
  }
  return response;
}
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (isArtwork(request, url)) {
    event.respondWith(cachedArtwork(request));
    return;
  }
  if (!isPublicAsset(url)) return;

  // Network first, cache só para o shell. Catálogo privado usa IndexedDB no app; streams nunca entram neste cache.
  event.respondWith(
    fetch(request).then(response => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        event.waitUntil(caches.open(VERSION).then(cache => cache.put(request, copy)));
      }
      return response;
    }).catch(async () => (await caches.match(request)) ||
      new Response('Sem conexão. Abra o Lux Cinema novamente quando estiver online.', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      }))
  );
});
