// Service Worker für Web-Push. Läuft unabhängig vom offenen Tab im
// Hintergrund und zeigt Systembenachrichtigungen, sobald der Server (siehe
// backend/src/utils/pushJobs.js) eine Push-Nachricht schickt.
//
// WICHTIG: diese Datei muss im Root des Frontends liegen (dort, wo auch
// index.html liegt), NICHT unter js/ - der Geltungsbereich ("scope") eines
// Service Workers ist standardmäßig auf sein eigenes Verzeichnis und alles
// darunter beschränkt.

// Schreibt jede eingehende Push-Nachricht zusätzlich in den persistenten
// Benachrichtigungsverlauf (js/notifications.js), damit sie im "Mehr" >
// "Benachrichtigungen"-Tab sichtbar ist - auch wenn sie ankam, während kein
// Tab offen war (der Store läuft über IndexedDB, nicht über die Seite).
try {
  self.importScripts('./js/notifications.js');
} catch (err) {
  // Sollte importScripts fehlschlagen, bleibt die Push-Zustellung selbst
  // trotzdem funktionsfähig - nur der Verlauf fehlt dann.
}

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

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      (typeof NotificationStore !== 'undefined'
        ? NotificationStore.add({ title, body: options.body, url: options.data.url }).catch(() => {})
        : Promise.resolve()),
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        clientList.forEach((client) => client.postMessage({ type: 'oepnv-navi:notification-added' }));
      }),
    ]),
  );
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
