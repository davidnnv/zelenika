// Zelenika — service worker.
// The site opens even without internet (cached shell); reservations/admin data always go to Supabase (never cached).
// Also receives Web Push notifications about new reservations for the admin.
const VERSION = 'zl-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icons/favicon-64.png', '/icons/icon-192.png', '/icons/icon-512.png'];
const DEV = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';

self.addEventListener('install', (e) => {
  e.waitUntil((DEV ? Promise.resolve() : caches.open(VERSION).then((c) => c.addAll(SHELL))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (DEV) return; // never cache while developing
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // Supabase etc. always live

  // Pages: network first, offline → the saved app
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // Code, styles, icons, photos: cache first (file names change with every new version)
  if (/^\/(assets|icons|photos)\//.test(url.pathname) || url.pathname === '/manifest.webmanifest') {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/admin';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => new URL(c.url).pathname.startsWith('/admin'));
      if (open) return open.focus();
      return self.clients.openWindow(target);
    })
  );
});

// Web Push from the Supabase Edge Function (supabase/functions/push-new-reservation)
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data && event.data.text() }; }
  const title = d.title || 'Zelenika';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: d.body || '',
      tag: d.tag || 'zelenika',
      renotify: true,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      vibrate: [120, 60, 120],
      data: { url: d.url || '/admin' },
    })
  );
});
