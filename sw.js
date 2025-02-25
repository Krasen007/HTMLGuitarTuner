// sw.js - Service Worker Implementation
const CACHE_VERSION = 'guitar-tuner-v2';
const CACHE_FILES = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/icon512.png'
];

// Skip waiting and claim clients immediately
self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_VERSION).then(cache => cache.addAll(CACHE_FILES)),
      self.skipWaiting() // Forces the waiting service worker to become the active service worker
    ])
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name.startsWith('guitar-tuner-') && name !== CACHE_VERSION)
            .map(name => caches.delete(name))
        );
      }),
      // Take control of all pages immediately
      self.clients.claim()
    ])
  );
});

// Cache-first strategy with network update
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      // Clone the request because it can only be used once
      const fetchPromise = fetch(event.request.clone())
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_VERSION).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        });

      return response || fetchPromise;
    })
  );
});

// Listen for messages from the client
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});