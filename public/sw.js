const CACHE_NAME = 'half-staff-pwa-v5';
const APP_SHELL = [
  '/',
  '/index.html',
  '/theme-init.js',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Always bypass Service Worker interception for geolocation and forced live refreshes
  if (
    url.pathname.startsWith('/api/locate') ||
    (url.pathname.startsWith('/api/flag-status') &&
      (url.searchParams.get('refresh') === '1' || url.searchParams.get('fresh') === '1'))
  ) {
    return;
  }

  // Network-first with cache fallback for standard flag status API and HTML navigation
  if (url.pathname.startsWith('/api/flag-status') || request.mode === 'navigate') {
    const cacheKey = url.pathname.startsWith('/api/flag-status')
      ? new Request(new URL('/api/flag-status', self.location.origin).toString())
      : request;

    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(cacheKey);
          if (cached) return cached;
          if (request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          throw new Error('Offline and no cached response available');
        })
    );
    return;
  }

  // Stale-while-revalidate for static assets (JS, CSS, icons)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse.ok) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse || Response.error());

      return cachedResponse || fetchPromise;
    })
  );
});
