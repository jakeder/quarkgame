// Minimal service worker — exists so the game installs as a standalone PWA
// and the app shell loads instantly. Strategy is network-first for our own
// files (so fresh deploys always win when online), with the cache as an
// offline fallback. Cross-origin requests (Firebase SDK on gstatic, the
// realtime database on firebaseio) are never intercepted.

const CACHE = 'qq-shell-v9';
const SHELL = [
  './',
  './index.html',
  './style.css',
  './settings.js',
  './game.js',
  './ui.js',
  './multiplayer.js',
  './manifest.webmanifest',
  './assets/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Only same-origin GETs. Let Firebase and every other cross-origin request
  // go straight to the network untouched.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // Never cache the Firebase Hosting auto-config or the SW itself.
  if (url.pathname.startsWith('/__/') || url.pathname.endsWith('/sw.js')) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
  );
});
