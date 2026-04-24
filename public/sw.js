// Service Worker for S21 Field AI
// Network-first strategy + Push Notifications
// Bumped v5 2026-04-24 to evict cached bundles with broken OSM tile URLs
// and Google-tracking-prevention-blocked Google tile URLs. Any rep on a
// stale tab gets their cache cleared on next SW activation.
const VERSION = 's21-sw-v5-2026-04-24';

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

// ─── Push Notification Handler ─────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'Susan AI', body: 'New notification', data: {} };
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    // If not JSON, treat as plain text
    data.body = event.data ? event.data.text() : 'New notification';
  }

  const options = {
    body: data.body,
    icon: '/s21-icon-192.png',
    badge: '/s21-icon-192.png',
    data: data.data || {},
    tag: data.tag || data.data?.type || 'default',
    renotify: true,
    vibrate: [200, 100, 200],
    actions: data.actions || []
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ─── Notification Click Handler ────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let targetUrl = '/';

  switch (data.type) {
    case 'storm_alert':
      targetUrl = '/?panel=stormmap';
      break;
    case 'impact_alert':
      targetUrl = '/?panel=impacted';
      break;
    case 'team_mention':
    case 'message':
    case 'direct_message':
      targetUrl = '/?panel=team';
      break;
    case 'calendar_reminder':
      targetUrl = '/?panel=calendar';
      break;
    case 'contest_alert':
      targetUrl = '/?panel=contests';
      break;
    case 'job_update':
      targetUrl = '/?panel=documentjob';
      break;
    case 'checkin_alert':
      targetUrl = '/?panel=canvassing';
      break;
    default:
      targetUrl = '/?panel=notifications';
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing window if available
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Open new window if none found
      return self.clients.openWindow(targetUrl);
    })
  );
});
