const CACHE = 'ronsho-pwa-20261001-v10-tanto';
const CORE = [
  './',
  './index.html',
  './tanto.html',
  './tanto.css',
  './tanto.js',
  './decks/tanto-sosoku-1.json',
  './anki.html',
  './anki-app.html',
  './noriben.html',
  './noriben-base.html',
  './manifest.webmanifest',
  './pwa.js',
  './decks/minpo-sosoku.b64.1',
  './decks/minpo-sosoku.b64.2',
  './decks/minpo-sosoku.b64.3',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE && key.startsWith('ronsho-pwa-')).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(cache => cache.put(req, copy));
        return res;
      }).catch(async () => {
        return (await caches.match(req)) || (await caches.match('./index.html'));
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(cache => cache.put(req, copy));
      }
      return res;
    }))
  );
});
