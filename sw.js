// Cache-with-network-fallback so the app still works with no connection
// (WiFi drops mid-workout, gym with no signal, airplane mode, etc.) while
// still preferring fresh content whenever it's actually online. Bump
// CACHE_VERSION when the APP_SHELL list below changes, to drop stale
// entries from old versions.
const CACHE_VERSION = 'v44';
const CACHE_NAME = `trainhard-${CACHE_VERSION}`;

// The bare minimum needed for the app to boot at all with no network,
// including a full first-ever launch that has never been online before —
// this is why the vendored three.js/supabase-js modules are listed
// explicitly instead of relying on the runtime cache-first handler below to
// pick them up "the first time they're fetched." Everything else — sound
// effects, 3D models, backgrounds — still relies on that runtime caching,
// so a normal at-home/on-wifi session is enough to make the next offline
// session work for those.
const APP_SHELL = [
  './',
  './index.html',
  './eat-plenty.html',
  './exercises.js',
  './tutorial.css',
  './tutorial.js',
  './eat-plenty-tutorial.js',
  './extended-rest-notifications.js',
  './Aura/toon-outline-code.js',
  './Aura/toon-outline-apply.js',
  './manifest.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png',
  './vendor/three/three.module.js',
  './vendor/three/addons/loaders/GLTFLoader.js',
  './vendor/three/addons/utils/BufferGeometryUtils.js',
  './vendor/three/addons/controls/OrbitControls.js',
  './vendor/supabase/supabase-js.bundle.mjs',
  './vendor/supabase/process.mjs',
  './vendor/supabase/buffer.mjs',
  './vendor/supabase/events.mjs',
  './vendor/supabase/tty.mjs',
  './vendor/supabase/async_hooks.mjs',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(APP_SHELL.map(url => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Focus (or open) the app when a rest-complete notification is tapped,
// instead of leaving it sitting in the notification tray with no effect.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});

// Never let this service worker touch Supabase API traffic. This was the
// actual root cause of a long-running "friend request looks stale/invisible"
// bug: the catch-all "cache-first for everything else" branch below was
// silently caching every Supabase SELECT (a GET request to a different
// origin, same as any static asset) and then serving that same cached
// response forever, regardless of any cache:'no-store' set on the fetch()
// call itself — a service worker intercepts the request before that option
// is ever consulted. Live user/account data must always hit the network.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.hostname.endsWith('.supabase.co')) return;

  const isNavigation = req.mode === 'navigate';
  const isCoreScript = url.origin === self.location.origin && /\.(html|js)$/.test(url.pathname);

  if (isNavigation || isCoreScript) {
    // Network-first for the app's own HTML/JS: always prefer the latest
    // code when online (the in-app version check relies on getting a fresh
    // index.html to notice an update), falling back to whatever's cached
    // when there's no connection at all.
    e.respondWith((async () => {
      const cached = await caches.match(req);
      // cache: 'no-store' bypasses the browser's ordinary HTTP cache — a plain
      // fetch() here would honor the host's Cache-Control headers and could
      // silently hand back a stale index.html/JS even though this is meant to
      // be "network-first", which is exactly how installed PWAs kept running
      // old friend-request code after a push that "worked" in a fresh tab.
      const networkPromise = fetch(req, { cache: 'no-store' }).then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, copy));
        return res;
      }).catch(() => null);

      if (!cached) {
        // Nothing to fall back to yet (first-ever launch) — network is the
        // only option, however long it takes.
        return (await networkPromise) || (isNavigation ? caches.match('./index.html') : undefined);
      }

      // On a weak/degraded connection ("lie-fi" — bars showing but requests
      // stall) a fetch can sit unresolved far longer than a real timeout
      // before it ever rejects, which used to leave the whole app stuck on
      // a blank/loading screen even though a perfectly good cached copy was
      // sitting right there — the .catch() above only helps once the
      // request actually fails, not while it's silently hanging. Race it
      // against a short timer instead: serve the cached copy the moment the
      // network looks too slow to be usable, while letting the network
      // request keep running in the background to refresh the cache for
      // next time in case it does eventually complete.
      return Promise.race([
        networkPromise.then(res => res || cached),
        new Promise(resolve => setTimeout(() => resolve(cached), 2500)),
      ]);
    })());
    return;
  }

  // Cache-first for everything else: sound/model/image assets and the
  // version-pinned three.js CDN modules never change once fetched, so serve
  // instantly from cache when present and only hit the network to fill it.
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
