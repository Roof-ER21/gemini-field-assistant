// Minimal Service Worker for S21 Field AI
// Network-first strategy; no precache
const VERSION = 's21-sw-v3-2026-02-11';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Only handle same-origin requests for static assets
  if (url.origin !== self.location.origin) return;

  // Skip index.html - let the network handle it
  if (url.pathname === '/' || url.pathname.endsWith('/index.html')) return;

  // Skip API calls
  if (url.pathname.startsWith('/api/')) return;

  // Skip socket.io / websocket paths
  if (url.pathname.startsWith('/socket.io')) return;

  // Only cache static assets (js, css, images, fonts)
  const ext = url.pathname.split('.').pop();
  const cacheableExts = ['js', 'css', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'woff', 'woff2', 'ttf', 'eot'];
  if (!cacheableExts.includes(ext)) return;

  event.respondWith(
    fetch(req).then(res => {
      return res;
    }).catch(() => {
      // Offline: try cache silently, or return minimal error
      return caches.open(VERSION).then(cache => cache.match(req)).then(cached => {
        if (cached) return cached;
        return new Response('', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
