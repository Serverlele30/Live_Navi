// Fahrtalarm: weckt akustisch/optisch/via Vibration, wenn eine laufende Fahrt
// noch X Stationen von einer gewählten Zielhaltestelle entfernt ist. Läuft im
// Hintergrund weiter (eigenes Poll-Intervall), unabhängig davon, welcher Tab
// gerade aktiv ist - genau wie der Störungs-Push für Favoriten. Bleibt über
// einen Seiten-Reload hinweg erhalten (localStorage), damit ein versehentlicher
// Reload den Alarm nicht killt.

const TripAlarm = (() => {
  const STORAGE_KEY = 'oepnv-navi:db-trip-alarm';
  const POLL_MS = 15000;

  let alarm = null; // { tripId, line, color, textColor, targetIndex, targetName, stopsBefore, triggered }
  let pollHandle = null;
  let audioCtx = null;
  let soundLoopHandle = null;

  function persist() {
    if (alarm) localStorage.setItem(STORAGE_KEY, JSON.stringify(alarm));
    else localStorage.removeItem(STORAGE_KEY);
  }

  function set({ tripId, line, color, textColor, targetIndex, targetName, stopsBefore }) {
    stopSound();
    alarm = {
      tripId, line, color, textColor, targetIndex, targetName,
      stopsBefore: Number.isFinite(stopsBefore) ? stopsBefore : 1,
      triggered: false,
    };
    persist();
    renderBanner();
    restartPolling();
    check(); // sofort einmal prüfen statt erst nach POLL_MS zu warten

    // Best effort: Alarm zusätzlich serverseitig spiegeln, damit er auch bei
    // geschlossenem Tab/Browser noch auslöst. Schlägt das fehl (Push nicht
    // aktiviert/unterstützt), läuft der normale Tab-lokale Alarm unverändert
    // weiter - das hier ist rein additiv.
    if (window.Push) Push.syncTripAlarm({ tripId, source: 'vbb', line, targetName, targetIndex, stopsBefore: alarm.stopsBefore });
  }

  function clear() {
    stopSound();
    alarm = null;
    persist();
    stopPolling();
    hideBanner();
    hideOverlay();
    if (window.Push) Push.clearTripAlarm();
  }

  function getActive() {
    return alarm;
  }

  function isActiveFor(tripId, index) {
    return !!alarm && alarm.tripId === tripId && alarm.targetIndex === index;
  }

  // Beim App-Start einen zuvor gesetzten Alarm wiederherstellen (z.B. nach
  // versehentlichem Reload der Seite während der Fahrt).
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || !saved.tripId) return;
      alarm = saved;
      if (alarm.triggered) {
        // Alarm war schon ausgelöst, aber nicht bestätigt (z.B. Tab wurde
        // neu geladen, während das Overlay offen war) - erneut anzeigen,
        // ohne Ton/Vibration erneut auszulösen.
        showOverlay(alarm.targetName, alarm.lastStopsRemaining || 0);
      } else {
        renderBanner();
        restartPolling();
      }
    } catch (_) {
      // kein gespeicherter Alarm, ignorieren
    }
  }

  function restartPolling() {
    stopPolling();
    pollHandle = setInterval(check, POLL_MS);
  }

  function stopPolling() {
    if (pollHandle) {
      clearInterval(pollHandle);
      pollHandle = null;
    }
  }

  async function check() {
    if (!alarm) return;

    let trip;
    try {
      trip = await API.getTrip(alarm.tripId);
    } catch (err) {
      console.error('Fahrtalarm-Fehler:', err.message);
      return;
    }

    if (trip.cancelled) {
      notify('Fahrt fällt aus', `Die Fahrt der Linie ${trip.line || alarm.line || ''} wurde storniert - Fahrtalarm wurde beendet.`);
      clear();
      return;
    }

    const stopovers = trip.stopovers || [];
    const now = Date.now();
    let currentIndex = stopovers.findIndex((s) => {
      const t = s.arrival || s.departure || s.plannedArrival || s.plannedDeparture;
      return t && new Date(t).getTime() >= now;
    });
    if (currentIndex === -1) currentIndex = stopovers.length;

    // Ziel-Index robust wiederfinden, falls sich die Stopover-Liste seit dem
    // Setzen des Alarms leicht verschoben hat (z.B. durch einen zusätzlich
    // entfallenen Zwischenhalt).
    let targetIndex = alarm.targetIndex;
    if (!stopovers[targetIndex] || stopovers[targetIndex].name !== alarm.targetName) {
      const found = stopovers.findIndex((s) => s.name === alarm.targetName);
      if (found !== -1) targetIndex = found;
    }
    alarm.targetIndex = targetIndex;

    const stopsRemaining = Math.max(0, targetIndex - currentIndex);
    const reached = currentIndex >= targetIndex;

    if (!alarm.triggered && (reached || stopsRemaining <= alarm.stopsBefore)) {
      alarm.triggered = true;
      alarm.lastStopsRemaining = stopsRemaining;
      persist();
      stopPolling();
      triggerAlarm(alarm.targetName, stopsRemaining);
      return;
    }

    persist();
    renderBanner(stopsRemaining);
  }

  function triggerAlarm(stopName, stopsRemaining) {
    showOverlay(stopName, stopsRemaining);
    playSound();
    if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]);
    notify('Fahrtalarm', stopsRemaining === 0
      ? `Gleich da: ${stopName}`
      : `Noch ${stopsRemaining} Station${stopsRemaining === 1 ? '' : 'en'} bis ${stopName}`);
  }

  function notify(title, body) {
    if (window.NotificationStore) {
      NotificationStore.add({ title, body, icon: '⏰' }).then(() => {
        const badge = document.getElementById('notifications-badge');
        if (badge) badge.hidden = false;
      }).catch(() => {});
    }
    if (window.Notification && Notification.permission === 'granted') {
      try {
        new Notification(title, { body, tag: 'oepnv-navi-fahrtalarm' });
      } catch (err) {
        console.error('Notification-Fehler:', err.message);
      }
    }
  }

  // ---------- Ton (Web Audio, kein externes Asset nötig) ----------

  function playSound() {
    stopSound();
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const beep = () => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.value = 880;
        gain.gain.value = 0.16;
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.35);
      };
      beep();
      soundLoopHandle = setInterval(beep, 900);
    } catch (err) {
      console.error('Fahrtalarm-Ton-Fehler:', err.message);
    }
  }

  function stopSound() {
    if (soundLoopHandle) {
      clearInterval(soundLoopHandle);
      soundLoopHandle = null;
    }
  }

  // ---------- Persistenter Hinweis-Banner (solange Alarm noch nicht ausgelöst) ----------

  function ensureBanner() {
    let banner = document.getElementById('trip-alarm-banner');
    if (banner) return banner;
    banner = document.createElement('div');
    banner.id = 'trip-alarm-banner';
    banner.className = 'trip-alarm-banner';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.innerHTML = `
      <span class="trip-alarm-banner__icon" aria-hidden="true">🔔</span>
      <span id="trip-alarm-banner__text" class="trip-alarm-banner__text"></span>
      <button id="trip-alarm-banner__cancel" type="button">Alarm beenden</button>
    `;
    document.body.appendChild(banner);
    banner.querySelector('#trip-alarm-banner__cancel').addEventListener('click', clear);

    // Position hängt vom tatsächlich gerenderten Header ab (unterscheidet
    // sich zwischen Mobile/Desktop und wird nicht über CSS-Breakpoint-Werte
    // geraten, sondern - wie schon bei der Live-Karte - direkt gemessen),
    // damit das Banner den Header/die Suche nie verdeckt, egal auf welcher
    // Displaygröße oder welchem Tab (z.B. auch über der jetzt display-breiten
    // Live-Karte) es gerade erscheint.
    window.addEventListener('resize', schedulePositionBanner);
    window.addEventListener('orientationchange', schedulePositionBanner);

    return banner;
  }

  let positionScheduled = false;
  function schedulePositionBanner() {
    if (positionScheduled) return;
    positionScheduled = true;
    requestAnimationFrame(() => {
      positionScheduled = false;
      positionBanner();
    });
  }

  function positionBanner() {
    const banner = document.getElementById('trip-alarm-banner');
    if (!banner) return;
    const header = document.querySelector('.app-header');
    const headerBottom = header ? header.getBoundingClientRect().bottom : 0;
    banner.style.top = `${Math.max(12, Math.round(headerBottom + 8))}px`;
  }

  function renderBanner(stopsRemaining) {
    if (!alarm) return;
    const banner = ensureBanner();
    const textEl = banner.querySelector('#trip-alarm-banner__text');
    const line = alarm.line ? `${alarm.line} · ` : '';
    textEl.textContent = stopsRemaining == null
      ? `Fahrtalarm gesetzt für ${alarm.targetName}`
      : `${line}Fahrtalarm: noch ${stopsRemaining} Station${stopsRemaining === 1 ? '' : 'en'} bis ${alarm.targetName}`;
    positionBanner();
    banner.classList.add('is-visible');
  }

  function hideBanner() {
    const banner = document.getElementById('trip-alarm-banner');
    if (banner) banner.classList.remove('is-visible');
  }

  // ---------- Vollbild-Overlay bei Auslösung ----------

  function ensureOverlay() {
    let overlay = document.getElementById('trip-alarm-overlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'trip-alarm-overlay';
    overlay.className = 'trip-alarm-overlay';
    overlay.hidden = true;
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'trip-alarm-overlay__heading');
    overlay.setAttribute('aria-describedby', 'trip-alarm-overlay__text');
    overlay.innerHTML = `
      <div class="trip-alarm-overlay__card">
        <div class="trip-alarm-overlay__icon" aria-hidden="true">⏰</div>
        <h2 id="trip-alarm-overlay__heading">Aufwachen!</h2>
        <p id="trip-alarm-overlay__text"></p>
        <button id="trip-alarm-overlay__dismiss" type="button">Alarm beenden</button>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#trip-alarm-overlay__dismiss').addEventListener('click', clear);

    // Nur ein interaktives Element im Overlay - "Falle" ist hier trivial:
    // Tab/Shift+Tab bleibt einfach immer auf dem einen Button, Escape löst
    // dieselbe Aktion wie der Button aus.
    overlay.addEventListener('keydown', (e) => {
      if (overlay.hidden) return;
      const dismissBtn = document.getElementById('trip-alarm-overlay__dismiss');
      if (e.key === 'Tab') {
        e.preventDefault();
        dismissBtn.focus();
      } else if (e.key === 'Escape') {
        clear();
      }
    });

    return overlay;
  }

  function showOverlay(stopName, stopsRemaining) {
    hideBanner();
    const overlay = ensureOverlay();
    document.getElementById('trip-alarm-overlay__text').textContent = stopsRemaining === 0
      ? `Gleich da: ${stopName}`
      : `Noch ${stopsRemaining} Station${stopsRemaining === 1 ? '' : 'en'} bis ${stopName}`;
    overlay.hidden = false;
    // Fokus sofort auf den einzigen Button - der Alarm unterbricht bewusst
    // alles andere, das muss auch für Screenreader-Nutzer sofort ankommen.
    document.getElementById('trip-alarm-overlay__dismiss').focus();
  }

  function hideOverlay() {
    const overlay = document.getElementById('trip-alarm-overlay');
    if (overlay) overlay.hidden = true;
  }

  return { set, clear, getActive, isActiveFor, load };
})();
