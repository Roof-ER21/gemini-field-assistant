// Minimal Service Worker for S21 Field AI
// Network-first strategy to avoid stale assets; no precache
const VERSION = 's21-sw-v1-2025-11-03';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Clean old caches if used in future
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Do not cache index.html explicitly; rely on server no-cache
  const url = new URL(req.url);
  if (url.pathname === '/' || url.pathname.endsWith('/index.html')) {
    return; // let the network handle it
  }

  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      return res;
    } catch (err) {
      // Offline fallback from cache (if any)
      const cache = await caches.open(VERSION);
      const cached = await cache.match(req);
      if (cached) return cached;
      throw err;
    }
  })());
});

