// Always fetch fresh from network — no caching, PWA install only.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request, { cache: 'no-store' }).catch(() => fetch(e.request)));
});
