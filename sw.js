// No caching — always load fresh from network.
// Service worker exists only to enable PWA installation.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
