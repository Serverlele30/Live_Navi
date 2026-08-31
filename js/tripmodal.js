// Modal, das beim Klick auf eine Abfahrtszeile oder einen Verbindungsabschnitt
// geöffnet wird: zeigt Linie, Richtung, eine kleine Karte mit dem Streckenverlauf
// und alle Zwischenhalte mit Zeiten/Verspätungen. Über die Glocken-Buttons an
// den kommenden Halten kann hier außerdem ein Fahrtalarm gesetzt werden
// (siehe tripalarm.js).

const TripModal = (() => {
  const ALARM_OFFSET_KEY = 'oepnv-navi:db-alarm-offset';

  let backdrop = null;
  let miniMap = null;

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
      if (e.key === 'Escape' && !backdrop.hidden) close();
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
  }

  function formatTime(iso) {
    if (!iso) return null;
    return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
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
    const alarmHtml = canAlarm
      ? `<button class="trip-stopover__alarm-btn ${isActiveAlarm ? 'is-active' : ''}" data-alarm-index="${index}" type="button" title="${isActiveAlarm ? 'Fahrtalarm entfernen' : 'Fahrtalarm für diese Haltestelle setzen'}">${isActiveAlarm ? '🔔' : '🔕'}</button>`
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
    const el = ensureBackdrop();
    el.hidden = false;
    currentTripId = tripId;
    currentTrip = null;

    document.getElementById('trip-modal-line').textContent = '…';
    document.getElementById('trip-modal-line').style.background = '#8E99A6';
    document.getElementById('trip-modal-direction').textContent = '';
    document.getElementById('trip-modal-meta').textContent = '';
    document.getElementById('trip-modal-body').innerHTML = '<div class="trip-modal__loading"><span class="spinner"></span>Lade Fahrt-Details…</div>';

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

