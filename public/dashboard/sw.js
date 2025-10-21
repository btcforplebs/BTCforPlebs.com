// sw.js - Save this file in the same directory as your HTML
const CACHE_NAME = 'nostr-dm-v1';
const urlsToCache = [
  '/',
  '/index.html'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});

self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'New Nostr DM';
  const options = {
    body: data.body || 'You have a new message',
    icon: 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'192\' height=\'192\' viewBox=\'0 0 192 192\'%3E%3Crect width=\'192\' height=\'192\' fill=\'%23fdad01\' rx=\'24\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' font-size=\'90\' fill=\'%23000\' text-anchor=\'middle\' dominant-baseline=\'middle\'%3E📬%3C/text%3E%3C/svg%3E',
    badge: 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'96\' height=\'96\' viewBox=\'0 0 96 96\'%3E%3Ccircle cx=\'48\' cy=\'48\' r=\'48\' fill=\'%23fdad01\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' font-size=\'50\' text-anchor=\'middle\' dominant-baseline=\'middle\'%3E📬%3C/text%3E%3C/svg%3E',
    vibrate: [200, 100, 200],
    tag: 'nostr-dm'
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});