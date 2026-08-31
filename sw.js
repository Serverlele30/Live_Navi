// Service Worker für Web-Push. Läuft unabhängig vom offenen Tab im
// Hintergrund und zeigt Systembenachrichtigungen, sobald der Server (siehe
// backend/src/utils/pushJobs.js) eine Push-Nachricht schickt.
//
// WICHTIG: diese Datei muss im Root des Frontends liegen (dort, wo auch
// index.html liegt), NICHT unter js/ - der Geltungsbereich ("scope") eines
// Service Workers ist standardmäßig auf sein eigenes Verzeichnis und alles
// darunter beschränkt.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = { title: 'ÖPNV Navi', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'ÖPNV Navi';
  const options = {
    body: data.body || '',
    tag: data.tag || 'oepnv-navi',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Klick auf die Benachrichtigung: vorhandenen App-Tab in den Vordergrund
// holen, statt immer einen neuen zu öffnen.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return undefined;
    }),
  );
});
