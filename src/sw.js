import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

/*
 * FIX (stale homepage after reload):
 * Before, this worker never called skipWaiting()/clientsClaim(), so after a
 * deploy the NEW worker sat in "waiting" and the OLD worker kept serving the
 * OLD precached index.html for "/" (workbox maps "/" -> index.html). Other
 * URLs like /tasks were not precached, so they hit the network and loaded
 * the new build. That is why only a reload on the homepage showed the old
 * "Quick Tasks" UI.
 */
self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();

// Precache hashed JS/CSS/images only. index.html is deliberately NOT precached
// so "/" can never be served from an old build.
const manifest = (self.__WB_MANIFEST || []).filter(
  (entry) => (typeof entry === 'string' ? entry : entry.url) !== 'index.html'
);
precacheAndRoute(manifest, { directoryIndex: null, cleanURLs: false });

// Page navigations always try the network first (fresh index.html after every
// deploy) and only fall back to a cached copy when offline.
registerRoute(
  new NavigationRoute(new NetworkFirst({ cacheName: 'tasklink-pages' }), {
    denylist: [/^\/api\//],
  })
);

self.addEventListener('push', (event) => {
  let data = { title: 'TaskLink', body: 'You have a new notification' };
  try {
    if (event.data) data = event.data.json();
  } catch {
    if (event.data) data.body = event.data.text();
  }

  const options = {
    body: data.body || '',
    icon: './assets/126895-removebg-preview.png',
    badge: '/assets/logo.png',
    data: { url: data.url || '/notifications' },
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
  };

  event.waitUntil(self.registration.showNotification(data.title || 'TaskLink', options));
});

// Clicking the OS notification focuses an already-open TaskLink tab if
// there is one, otherwise opens a new one at the relevant page.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/notifications';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => c.url.startsWith(self.location.origin));
      if (existing) {
        existing.focus();
        if ('navigate' in existing) existing.navigate(url);
        return undefined;
      }
      return self.clients.openWindow(url);
    })
  );
});
