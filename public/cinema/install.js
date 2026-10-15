(() => {
  'use strict';
  // Registra apenas a experiência Cinema. O SW jamais controla /player.
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/cinema/sw.js', { scope: '/cinema/' })
      .catch(error => console.warn('[Lux Cinema PWA] Instalação offline indisponível:', error));
  }, { once: true });
})();
