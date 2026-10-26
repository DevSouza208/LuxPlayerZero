/* Lux Cinema PWA: cache somente da interface pública. Nunca armazenar M3U, mídia,
 * /api, credenciais ou respostas de terceiros no service worker. */
const VERSION = 'lux-cinema-shell-24';
const ASSETS = [
  '/tmdb-rich-view.js', '/guest-mode.js', '/catalog-relations.js', '/quick-guide.js', '/guide-model.js', '/catalog-navigation.js', '/connectivity.js', '/connectivity.css', '/style.css', '/home.css', '/cinema-premium.css', '/cinema-polish.css', '/cinema-browse.css',
  '/cinema-app.js', '/home.js', '/episode-continuation.js', '/home-model.js', '/cinema-browse.js', '/tmdb-client.js', '/cinema-tmdb-tags.js', '/cinema-title.js', '/media-taxonomy.js', '/tv-normalizer.js', '/profile-store.js', '/recommendations.js', '/catalog-search-client.js', '/cinema-series.js', '/cinema-tv-groups.js', '/cinema-detail-page.js', '/cinema-detail-page.css', '/lux-tag-palette.js', '/lux-tag-palette.css', '/saved-catalog.js',
  '/playlist.js', '/gateway.js', '/direct-source.js',
  '/assets/lux-icon.png', '/assets/lux-logo.png'
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

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!isPublicAsset(url)) return;

  // Network first, cache só para o shell. O catálogo e os streams sempre usam rede.
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
