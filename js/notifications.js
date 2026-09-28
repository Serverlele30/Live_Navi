// Persistenter Benachrichtigungsverlauf ("Notification Center"), analog zum
// Glocken-Icon in der iOS-App. Läuft als IndexedDB-Store, weil das - anders
// als localStorage - sowohl vom offenen Tab als auch vom Service Worker aus
// (auch bei geschlossenem Tab, siehe sw.js) beschrieben werden kann. Wird per
// <script> in index.html UND per importScripts() in sw.js eingebunden, daher
// bewusst keine ES-Module-Syntax.

const NotificationStore = (() => {
  const DB_NAME = 'oepnv-navi-notifications';
  const STORE = 'notifications';
  const MAX_ENTRIES = 50;

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in self)) {
        reject(new Error('IndexedDB nicht verfügbar'));
        return;
      }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function add(entry) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).add({
        title: entry.title || '',
        body: entry.body || '',
        url: entry.url || null,
        icon: entry.icon || '🔔',
        timestamp: entry.timestamp || Date.now(),
        read: false,
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    await trim();
  }

  async function list() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result.sort((a, b) => b.timestamp - a.timestamp));
      req.onerror = () => reject(req.error);
    });
  }

  async function clear() {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function markAllRead() {
    const db = await openDb();
    const entries = await list();
    if (entries.length === 0) return;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      entries.forEach((e) => store.put({ ...e, read: true }));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function trim() {
    const entries = await list();
    if (entries.length <= MAX_ENTRIES) return;
    const db = await openDb();
    const toRemove = entries.slice(MAX_ENTRIES);
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      toRemove.forEach((e) => store.delete(e.id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function unreadCount() {
    try {
      const entries = await list();
      return entries.filter((e) => !e.read).length;
    } catch (_) {
      return 0;
    }
  }

  return { add, list, clear, markAllRead, unreadCount };
})();

// In der Seite (nicht im Service-Worker-Kontext) global verfügbar machen.
if (typeof window !== 'undefined') {
  window.NotificationStore = NotificationStore;
}
