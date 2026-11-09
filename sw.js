/* Die Wichtelstube – Service Worker.
   VERSION bei jeder Änderung erhöhen (und in index.html bei ?v= angleichen) – dann holen installierte Apps die neue Fassung. */
const VERSION = '2.0.0';
const CACHE = 'wichtelstube-' + VERSION;
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './app.css?v=' + VERSION, './core.js?v=' + VERSION, './app.js?v=' + VERSION,
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', event => {
  // cache:'reload' umgeht den HTTP-Cache von GitHub Pages (max-age 10 Minuten).
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // Alte Caches entfernen, auch den der ersten Version („wichtelstube-app-v1“).
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('wichtelstube') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') { event.respondWith(networkFirst(req)); return; }
  event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});

// Seite: zuerst aus dem Netz (damit Aktualisierungen ankommen), bei fehlendem Netz aus dem Cache.
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    let timer;
    const res = await Promise.race([
      fetch(req).finally(() => clearTimeout(timer)),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 4000); })
    ]);
    if (res.ok && !res.redirected && res.type === 'basic') cache.put('./index.html', res.clone());
    return res;
  } catch (e) {
    return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
  }
}
