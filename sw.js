// Service worker : le site s'ouvre et s'installe sur téléphone, et reste utilisable sans réseau.
// Code et données : réseau d'abord (toujours la dernière version publiée), cache si hors connexion.
// Photos : cache d'abord (elles ne changent pas), mises en cache au fil de la consultation.
const CACHE = 'recettes-v1';
const COQUILLE = [
  './', 'index.html', 'style.css', 'donnees.js', 'photos.js', 'logique.js', 'app.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(COQUILLE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()));
});

const mettreEnCache = (req, rep) => {
  if (rep.ok) { const copie = rep.clone(); caches.open(CACHE).then((c) => c.put(req, copie)); }
  return rep;
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // liens vers les sources : réseau direct
  if (url.pathname.includes('/img/')) {
    e.respondWith(caches.match(req).then((c) => c || fetch(req).then((r) => mettreEnCache(req, r))));
    return;
  }
  e.respondWith(fetch(req).then((r) => mettreEnCache(req, r)).catch(() => caches.match(req, { ignoreSearch: true })));
});
