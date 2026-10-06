// Offline support. The page itself is fetched network-first (so a new build
// shows up as soon as you're online); everything else (hashed scripts,
// fonts, icons) is cache-first, since a changed file gets a new name.

const CACHE = 'endless-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      // no-cache: always ask the server (GitHub Pages lets browsers keep the page 10 minutes).
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put('./index.html', copy.clone()));
          pruneOldAssets(copy);
          return res;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        }),
    ),
  );
});

// Each build's scripts and styles have hashed names, so old ones would pile up
// in the cache forever. When a fresh page arrives, drop cached assets it no
// longer refers to (anything it loads later is fetched and cached again).
function pruneOldAssets(page) {
  page
    .text()
    .then((html) => {
      const used = new Set((html.match(/assets\/[^"'\s)]+/g) || []).map((p) => p.split('/').pop()));
      return caches.open(CACHE).then((cache) =>
        cache.keys().then((keys) =>
          Promise.all(
            keys
              .filter((k) => {
                const path = new URL(k.url).pathname;
                // Scripts and styles only: fonts are referenced from the styles, not the page.
                return path.includes('/assets/') && /\.(js|css)$/.test(path) && !used.has(path.split('/').pop());
              })
              .map((k) => cache.delete(k)),
          ),
        ),
      );
    })
    .catch(() => {});
}
