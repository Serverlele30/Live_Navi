// Modal, das beim Klick auf eine Abfahrtszeile oder einen Verbindungsabschnitt
// geöffnet wird: zeigt Linie, Richtung, eine kleine Karte mit dem Streckenverlauf
// und alle Zwischenhalte mit Zeiten/Verspätungen. Über die Glocken-Buttons an
// den kommenden Halten kann hier außerdem ein Fahrtalarm gesetzt werden
// (siehe tripalarm.js).

const TripModal = (() => {
  const ALARM_OFFSET_KEY = 'oepnv-navi:db-alarm-offset';
  const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  let backdrop = null;
  let miniMap = null;
  let lastFocusedElement = null;

  // Zustand der aktuell geöffneten Fahrt, damit wir nach dem Setzen/Entfernen
  // eines Alarms den Haltestellen-Teil neu rendern können, ohne die Fahrt
  // erneut vom Server zu laden.
  let currentTripId = null;
  let currentTrip = null;
  let currentIndex = -1;

  function ensureBackdrop() {
    if (backdrop) return backdrop;
    backdrop = document.createElement('div');
    backdrop.className = 'trip-modal-backdrop';
    backdrop.hidden = true;
    backdrop.innerHTML = `
      <div class="trip-modal" role="dialog" aria-modal="true" aria-label="Fahrt-Details">
        <div class="trip-modal__header">
          <span class="trip-modal__line" id="trip-modal-line"></span>
          <div class="trip-modal__title">
            <strong id="trip-modal-direction"></strong>
            <small id="trip-modal-meta"></small>
          </div>
          <button class="trip-modal__close" type="button" aria-label="Schließen">×</button>
        </div>
        <div class="trip-modal__stats" id="trip-modal-stats" hidden></div>
        <div class="trip-modal__map" id="trip-modal-map"></div>
        <div class="trip-modal__body" id="trip-modal-body">
          <div class="trip-modal__loading"><span class="spinner"></span>Lade Fahrt-Details…</div>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    backdrop.querySelector('.trip-modal__close').addEventListener('click', close);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });
    document.addEventListener('keydown', (e) => {
      if (backdrop.hidden) return;
      if (e.key === 'Escape') {
        close();
        return;
      }
      // Fokus-Falle: Tab darf das Dialog nicht verlassen, solange es offen
      // ist - sonst würde ein Tastatur-/Screenreader-Nutzer "hinter" den
      // Dialog auf die (für ihn unsichtbar gewordene) Seite dahinter tabben.
      if (e.key === 'Tab') {
        const focusable = Array.from(backdrop.querySelectorAll(FOCUSABLE_SELECTOR)).filter((el) => el.offsetParent !== null);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    // Delegierter Klick-Handler für die Alarm-Glocken an den Haltestellen -
    // einmalig registriert, damit er bei jedem open() weiter funktioniert,
    // ohne mehrfach angehängt zu werden.
    backdrop.querySelector('#trip-modal-body').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-alarm-index]');
      if (!btn || !currentTrip) return;
      const index = parseInt(btn.dataset.alarmIndex, 10);
      toggleAlarm(index);
    });

    return backdrop;
  }

  function close() {
    if (!backdrop) return;
    backdrop.hidden = true;
    if (miniMap) {
      miniMap.remove();
      miniMap = null;
    }
    // Fokus zurück zur auslösenden Abfahrtszeile/dem Link geben, statt ihn
    // einfach verloren gehen zu lassen (würde sonst auf <body> zurückfallen -
    // Tastatur-/Screenreader-Nutzer wüssten dann nicht mehr, wo sie sind).
    if (lastFocusedElement && document.body.contains(lastFocusedElement)) {
      lastFocusedElement.focus();
    }
    lastFocusedElement = null;
  }

  function formatTime(iso) {
    if (!iso) return null;
    return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
  }

  // Verspätungsstatistik pro Linie - Datenbasis wächst erst über Zeit, auf
  // einem frisch aufgesetzten Server gibt es also erstmal nichts anzuzeigen.
  async function loadLineStats(line) {
    const el = document.getElementById('trip-modal-stats');
    if (!el) return;
    el.hidden = true;
    if (!line) return;

    try {
      const stats = await API.getLineDelayStats(line);
      if (!stats || !stats.sufficientData) return; // still hidden - keine Aussage besser als eine unsichere

      const avgMin = Math.round(stats.avgDelaySeconds / 60);
      const parts = [];
      parts.push(avgMin > 0 ? `Ø +${avgMin} Min` : 'Ø pünktlich');
      parts.push(`${stats.pctDelayed5plus}% ≥5 Min verspätet`);
      if (stats.pctCancelled > 0) parts.push(`${stats.pctCancelled}% Ausfälle`);

      el.textContent = `📊 ${parts.join(' · ')} (${stats.sampleCount} Fahrten, ${stats.days} Tage)`;
      el.hidden = false;
    } catch (err) {
      // Statistik ist ein "nice to have" - bei Fehlern einfach ausblenden,
      // ohne die eigentliche Fahrt-Detail-Ansicht zu stören.
      console.error('Verspätungsstatistik-Fehler:', err.message);
    }
  }

  function getAlarmOffset() {
    return parseInt(localStorage.getItem(ALARM_OFFSET_KEY), 10) || 1;
  }

  function setAlarmOffset(value) {
    localStorage.setItem(ALARM_OFFSET_KEY, String(value));
  }

  function toggleAlarm(index) {
    if (!currentTrip || !currentTripId) return;

    if (TripAlarm.isActiveFor(currentTripId, index)) {
      TripAlarm.clear();
    } else {
      const select = document.getElementById('trip-alarm-offset-select');
      const stopsBefore = select ? parseInt(select.value, 10) : getAlarmOffset();
      setAlarmOffset(stopsBefore);
      TripAlarm.set({
        tripId: currentTripId,
        line: currentTrip.line,
        color: currentTrip.color,
        textColor: currentTrip.textColor,
        targetIndex: index,
        targetName: (currentTrip.stopovers[index] || {}).name || '',
        stopsBefore,
      });
    }
    renderStopoversBody();
  }

  function renderStopover(s, index) {
    const time = s.departure || s.arrival || s.plannedDeparture || s.plannedArrival;
    const plannedTime = s.plannedDeparture || s.plannedArrival;
    const delay = s.departureDelay ?? s.arrivalDelay;
    const isCurrentOrNext = index === currentIndex;

    let timeHtml;
    if (s.cancelled) {
      timeHtml = `<span class="trip-stopover__time trip-stopover__time--cancelled">${formatTime(plannedTime) || '–'}</span>`;
    } else if (delay && delay > 0) {
      timeHtml = `<span class="trip-stopover__time trip-stopover__time--delayed">${formatTime(time)} (+${Math.round(delay / 60)})</span>`;
    } else {
      timeHtml = `<span class="trip-stopover__time">${formatTime(time) || '–'}</span>`;
    }

    // Ein Fahrtalarm ergibt nur für noch bevorstehende, nicht ausgefallene
    // Halte Sinn - nicht für bereits vergangene.
    const canAlarm = !s.cancelled && index >= currentIndex;
    const isActiveAlarm = canAlarm && TripAlarm.isActiveFor(currentTripId, index);
    const alarmLabel = isActiveAlarm ? 'Fahrtalarm entfernen' : `Fahrtalarm für ${s.name || 'diese Haltestelle'} setzen`;
    const alarmHtml = canAlarm
      ? `<button class="trip-stopover__alarm-btn ${isActiveAlarm ? 'is-active' : ''}" data-alarm-index="${index}" type="button" aria-label="${escapeHtml(alarmLabel)}" aria-pressed="${isActiveAlarm}" title="${escapeHtml(alarmLabel)}"><span aria-hidden="true">${isActiveAlarm ? '🔔' : '🔕'}</span></button>`
      : '';

    return `
      <div class="trip-stopover ${isCurrentOrNext ? 'trip-stopover--current' : ''} ${s.cancelled ? 'trip-stopover--cancelled' : ''}">
        <div class="trip-stopover__row">
          <span class="trip-stopover__name">${s.name || ''}</span>
          ${timeHtml}
          ${alarmHtml}
        </div>
      </div>
    `;
  }

  function renderStopoversBody() {
    const body = document.getElementById('trip-modal-body');
    if (!body || !currentTrip) return;
    const stopovers = currentTrip.stopovers || [];

    if (!stopovers.length) {
      body.innerHTML = '<div class="trip-modal__loading">Keine Zwischenhalte verfügbar.</div>';
      return;
    }

    const hasUpcoming = stopovers.some((s, i) => !s.cancelled && i >= currentIndex);
    const offsetSelectHtml = hasUpcoming
      ? `
        <div class="trip-alarm-offset-row">
          <span>🔔 Fahrtalarm:</span>
          <select id="trip-alarm-offset-select">
            <option value="0">bei Ankunft</option>
            <option value="1">1 Station vorher</option>
            <option value="2">2 Stationen vorher</option>
            <option value="3">3 Stationen vorher</option>
          </select>
          <small>Glocke an der Zielhaltestelle antippen</small>
        </div>
      `
      : '';

    body.innerHTML = `
      ${offsetSelectHtml}
      <div class="trip-stopovers">
        ${stopovers.map((s, i) => renderStopover(s, i)).join('')}
      </div>
    `;

    const select = document.getElementById('trip-alarm-offset-select');
    if (select) select.value = String(getAlarmOffset());
  }

  async function open(tripId) {
    if (!tripId) return;
    lastFocusedElement = document.activeElement;
    const el = ensureBackdrop();
    el.hidden = false;
    currentTripId = tripId;
    currentTrip = null;

    const statsEl = document.getElementById('trip-modal-stats');
    if (statsEl) { statsEl.hidden = true; }

    document.getElementById('trip-modal-line').textContent = '…';
    document.getElementById('trip-modal-line').style.background = '#8E99A6';
    document.getElementById('trip-modal-direction').textContent = '';
    document.getElementById('trip-modal-meta').textContent = '';
    document.getElementById('trip-modal-body').innerHTML = '<div class="trip-modal__loading"><span class="spinner"></span>Lade Fahrt-Details…</div>';

    // Fokus sofort in den Dialog holen (auf den Schließen-Button), damit
    // Screenreader-Nutzer merken, dass sich ein Dialog geöffnet hat, statt
    // weiter "unsichtbar" auf der jetzt verdeckten Seite zu stehen.
    const closeBtn = el.querySelector('.trip-modal__close');
    if (closeBtn) closeBtn.focus();

    let trip;
    try {
      trip = await API.getTrip(tripId, { polyline: true });
    } catch (err) {
      document.getElementById('trip-modal-body').innerHTML = `<div class="trip-modal__error">⚠ ${err.message}</div>`;
      return;
    }

    currentTrip = trip;

    const lineEl = document.getElementById('trip-modal-line');
    lineEl.textContent = trip.line || '?';
    lineEl.style.background = trip.color || '#8E99A6';
    lineEl.style.color = trip.textColor || '#fff';

    document.getElementById('trip-modal-direction').textContent = `→ ${trip.direction || trip.destination || ''}`;
    document.getElementById('trip-modal-meta').textContent = trip.cancelled
      ? 'Fahrt fällt aus'
      : `${trip.origin || ''} → ${trip.destination || ''}`;

    loadLineStats(trip.line);

    // Mini-Karte mit dem Streckenverlauf zeichnen
    if (miniMap) { miniMap.remove(); miniMap = null; }
    if (trip.polyline) {
      setTimeout(() => {
        miniMap = LiveMap.createMiniMap('trip-modal-map', {
          legs: [{ polyline: trip.polyline, walking: false, color: trip.color }],
        });
        if (trip.currentLocation) {
          L.marker([trip.currentLocation.latitude, trip.currentLocation.longitude], {
            icon: L.divIcon({
              className: 'vehicle-marker',
              html: `<span style="background:${trip.color || '#F5A623'};color:${trip.textColor || '#fff'};">${trip.line || '?'}</span>`,
              iconSize: [null, null],
            }),
          }).addTo(miniMap);
        }
      }, 50);
    } else {
      document.getElementById('trip-modal-map').innerHTML = '';
    }

    const stopovers = trip.stopovers || [];
    const now = Date.now();
    currentIndex = stopovers.findIndex((s) => {
      const t = s.departure || s.plannedDeparture;
      return t && new Date(t).getTime() >= now;
    });
    if (currentIndex === -1) currentIndex = stopovers.length - 1;

    renderStopoversBody();
  }

  return { open, close };
})();

