// Web-Push: Service-Worker-Registrierung, Subscription-Verwaltung und
// Synchronisierung der Favoriten/des Fahrtalarms mit dem Server, damit
// Benachrichtigungen auch bei geschlossenem Tab/Browser ankommen.
//
// Bewusst getrennt vom bisherigen, rein Tab-basierten Störungs-Push (siehe
// app.js showToast()/Notification-Aufrufe) - der bleibt als sofortiges,
// tab-lokales Feedback bestehen. Dieses Modul ist die zusätzliche,
// "funktioniert auch wenn die App zu ist"-Schicht.

const Push = (() => {
  const STORAGE_KEY = 'oepnv-navi:db-push-enabled';

  let registration = null;

  function isSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window;
  }

  async function registerServiceWorker() {
    if (!isSupported()) return null;
    try {
      registration = await navigator.serviceWorker.register('/sw.js');
      return registration;
    } catch (err) {
      console.error('Service-Worker-Registrierung fehlgeschlagen:', err.message);
      return null;
    }
  }

  // Wandelt den base64-kodierten VAPID-Public-Key in das Uint8Array-Format
  // um, das PushManager.subscribe() erwartet.
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
  }

  function isEnabled() {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  }

  async function getExistingSubscription() {
    if (!registration) return null;
    try {
      return await registration.pushManager.getSubscription();
    } catch (_) {
      return null;
    }
  }

  // Aktiviert Web-Push: fragt Benachrichtigungs-Erlaubnis an, abonniert beim
  // Push-Dienst des Browsers und meldet die Subscription + die aktuellen
  // Favoriten beim eigenen Backend an.
  async function enable(favorites) {
    if (!isSupported()) throw new Error('Push wird von diesem Browser nicht unterstützt.');
    if (!registration) await registerServiceWorker();
    if (!registration) throw new Error('Service Worker konnte nicht registriert werden.');

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Berechtigung für Benachrichtigungen wurde nicht erteilt.');

    const { publicKey } = await API.getPushPublicKey();
    let subscription = await getExistingSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    await API.subscribePush(subscription.toJSON(), favorites);
    localStorage.setItem(STORAGE_KEY, 'true');
  }

  async function disable() {
    localStorage.setItem(STORAGE_KEY, 'false');
    const subscription = await getExistingSubscription();
    if (!subscription) return;
    try {
      await API.unsubscribePush(subscription.endpoint);
      await subscription.unsubscribe();
    } catch (err) {
      console.error('Push-Abmeldung fehlgeschlagen:', err.message);
    }
  }

  // Wird aufgerufen, wenn sich die Favoriten ändern, während Push aktiv ist -
  // hält den Server auf dem gleichen Stand wie den Browser.
  async function syncFavorites(favorites) {
    if (!isEnabled()) return;
    const subscription = await getExistingSubscription();
    if (!subscription) return;
    try {
      await API.subscribePush(subscription.toJSON(), favorites);
    } catch (err) {
      console.error('Push-Favoriten-Sync fehlgeschlagen:', err.message);
    }
  }

  // Spiegelt einen Fahrtalarm serverseitig - "best effort": schlägt das fehl
  // (z.B. weil Push gar nicht aktiviert ist), bleibt der normale, Tab-lokale
  // Fahrtalarm trotzdem voll funktionsfähig.
  async function syncTripAlarm(alarm) {
    if (!isEnabled()) return;
    const subscription = await getExistingSubscription();
    if (!subscription) return;
    try {
      await API.setPushTripAlarm(subscription.endpoint, alarm);
    } catch (err) {
      console.error('Fahrtalarm-Push-Sync fehlgeschlagen:', err.message);
    }
  }

  async function clearTripAlarm() {
    if (!isEnabled()) return;
    const subscription = await getExistingSubscription();
    if (!subscription) return;
    try {
      await API.clearPushTripAlarm(subscription.endpoint);
    } catch (err) {
      console.error('Fahrtalarm-Push-Löschen fehlgeschlagen:', err.message);
    }
  }

  return { isSupported, registerServiceWorker, isEnabled, enable, disable, syncFavorites, syncTripAlarm, clearTripAlarm };
})();
