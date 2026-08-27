// Modal, das beim Klick auf eine Abfahrtszeile oder einen Verbindungsabschnitt
// geöffnet wird: zeigt Linie, Richtung, eine kleine Karte mit dem Streckenverlauf
// und alle Zwischenhalte mit Zeiten/Verspätungen.

const TripModal = (() => {
  let backdrop = null;
  let miniMap = null;

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

  function renderStopover(s, isCurrentOrNext) {
    const time = s.departure || s.arrival || s.plannedDeparture || s.plannedArrival;
    const plannedTime = s.plannedDeparture || s.plannedArrival;
    const delay = s.departureDelay ?? s.arrivalDelay;

    let timeHtml;
    if (s.cancelled) {
      timeHtml = `<span class="trip-stopover__time trip-stopover__time--cancelled">${formatTime(plannedTime) || '–'}</span>`;
    } else if (delay && delay > 0) {
      timeHtml = `<span class="trip-stopover__time trip-stopover__time--delayed">${formatTime(time)} (+${Math.round(delay / 60)})</span>`;
    } else {
      timeHtml = `<span class="trip-stopover__time">${formatTime(time) || '–'}</span>`;
    }

    return `
      <div class="trip-stopover ${isCurrentOrNext ? 'trip-stopover--current' : ''} ${s.cancelled ? 'trip-stopover--cancelled' : ''}">
        <div class="trip-stopover__row">
          <span class="trip-stopover__name">${s.name || ''}</span>
          ${timeHtml}
        </div>
      </div>
    `;
  }

  async function open(tripId) {
    if (!tripId) return;
    const el = ensureBackdrop();
    el.hidden = false;

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

    const lineEl = document.getElementById('trip-modal-line');
    lineEl.textContent = trip.line || '?';
    lineEl.style.background = trip.color || '#8E99A6';
    lineEl.style.color = trip.textColor || '#fff';

    document.getElementById('trip-modal-direction').textContent = `→ ${trip.direction || trip.destination || ''}`;
    document.getElementById('trip-modal-meta').textContent = trip.cancelled
      ? 'Fahrt fällt aus'
      : `${trip.origin || ''} → ${trip.destination || ''}`;

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
    let currentIndex = stopovers.findIndex((s) => {
      const t = s.departure || s.plannedDeparture;
      return t && new Date(t).getTime() >= now;
    });
    if (currentIndex === -1) currentIndex = stopovers.length - 1;

    const bodyHtml = `
      <div class="trip-stopovers">
        ${stopovers.map((s, i) => renderStopover(s, i === currentIndex)).join('')}
      </div>
    `;
    document.getElementById('trip-modal-body').innerHTML = stopovers.length
      ? bodyHtml
      : '<div class="trip-modal__loading">Keine Zwischenhalte verfügbar.</div>';
  }

  return { open, close };
})();