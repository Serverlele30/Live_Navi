// Live-Karte mit mehreren Modi:
//  - "radar":     zeigt alle Fahrzeuge im aktuellen Kartenausschnitt (Standard),
//                 gefiltert nach den gewählten Verkehrsmitteln
//  - "isolated":  ein Fahrzeug wurde angeklickt -> nur dieses wird live weiter-
//                 verfolgt (serverseitig via tripId gefiltert), sein Streckenverlauf
//                 wird eingezeichnet, alle anderen Fahrzeuge sind ausgeblendet
//  - "trip":      verfolgt ein bekanntes Fahrzeug (z.B. aus einer Verbindung heraus)
// Nutzt bewusst reines OpenStreetMap ohne zusätzlichen Kartenstil.
// Zusätzlich: createMiniMap() für kleine, unabhängige Vorschau-Karten in den
// Verbindungsergebnissen (Routenplaner).

const LiveMap = (() => {
  let map = null;
  let radarLayer = null;
  // Marker nach Fahrt-ID wiederverwenden, damit Live-Updates offene Popups nicht zerstören.
  let radarMarkers = new Map();
  let routeLayer = null;
  let userLayer = null;
  let tripMarker = null;

  let mode = 'radar';
  let radarPollHandle = null;
  let tripPollHandle = null;
  let currentTripId = null;
  let tripUpdateCallback = null;
  let isolatedMarker = null; // persistenter Marker im Isolations-Modus, wird nur aktualisiert statt neu erzeugt
  let isolatedVehicleMeta = null; // { line, color, textColor } für die Banner-Anzeige
  let getModesParam = () => null; // wird von außen (ModeFilter) gesetzt
  let resizeScheduled = false;

  function init() {
    if (map) return;

    map = L.map('live-map', { zoomControl: true }).setView([52.5200, 13.4050], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende',
      maxZoom: 19,
    }).addTo(map);

    radarLayer = L.layerGroup().addTo(map);
    routeLayer = L.layerGroup().addTo(map);
    userLayer = L.layerGroup().addTo(map);

    map.on('moveend', () => {
      if (mode === 'radar') refreshRadar();
    });

    // Die Karte soll die tatsächlich verfügbare Bildschirmhöhe ausfüllen -
    // unabhängig von Gerät/Displaygröße, Adressleisten-Ein-/Ausblenden auf
    // Mobilgeräten oder Bildschirmdrehung. Statt die Höhe über CSS mit
    // geschätzten Pixelwerten zu berechnen (die bei jedem neuen Gerät wieder
    // falsch wären), messen wir hier direkt den tatsächlich freien Platz und
    // setzen die Höhe daraus - das funktioniert für jede Displaygröße gleich
    // gut (Mobile First: der Startwert in CSS ist bereits mobilfreundlich,
    // hier wird er nur noch exakt nachjustiert).
    resizeToViewport();
    window.addEventListener('resize', scheduleResize);
    window.addEventListener('orientationchange', scheduleResize);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', scheduleResize);
    }
  }

  function scheduleResize() {
    if (resizeScheduled) return;
    resizeScheduled = true;
    requestAnimationFrame(() => {
      resizeScheduled = false;
      resizeToViewport();
    });
  }

  function resizeToViewport() {
    const el = document.getElementById('live-map');
    if (!el) return;

    const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const top = el.getBoundingClientRect().top;

    // Die feste untere Mobil-Navigationsleiste überlappt den Inhalt
    // (position: fixed) - ihre Höhe muss von der verfügbaren Fläche
    // abgezogen werden, sofern sie gerade sichtbar ist (auf Desktop-
    // Breiten ist sie per CSS ausgeblendet).
    const mobileNav = document.querySelector('.mobile-nav');
    const mobileNavHeight = mobileNav && getComputedStyle(mobileNav).display !== 'none'
      ? mobileNav.getBoundingClientRect().height
      : 0;

    const bottomSafety = 12; // etwas Luft, u.a. für mobile Adressleisten am unteren Rand
    const available = viewportHeight - top - mobileNavHeight - bottomSafety;

    el.style.height = `${Math.max(280, Math.round(available))}px`;
    if (map) map.invalidateSize();
  }

  function setModeFilter(fn) {
    getModesParam = fn;
  }

  function vehicleIcon(label, bg, fg, freifahrenReport = null) {
    const suspected = !!freifahrenReport;
    return L.divIcon({
      className: suspected ? 'vehicle-marker vehicle-marker--freifahren' : 'vehicle-marker',
      html: `<span style="background:${bg || '#F5A623'};color:${fg || '#fff'};">${label || '?'}</span>${suspected ? '<b class="vehicle-marker__kontrolle" title="Kontrolle vermutet">K</b>' : ''}`,
      iconSize: [null, null],
    });
  }

  let freifahrenReports = [];
  let freifahrenReportsFetchedAt = 0;
  let freifahrenReportsRequest = null;

  function normalizeMatchText(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function distanceBetweenCoordinates(a, b) {
    const rad = (value) => value * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function getReportMapDetails(report) {
    const station = report.station && typeof report.station === 'object' ? report.station : {};
    const line = report.line && typeof report.line === 'object' ? (report.line.name || report.line.id || '') : (report.line || report.lineId || '');
    const direction = report.direction && typeof report.direction === 'object' ? (report.direction.name || report.direction.label || '') : (report.direction || '');
    const coordinates = station.coordinates || report.coordinates || {};
    let lat, lon;
    if (Array.isArray(coordinates) && coordinates.length >= 2) {
      lon = Number(coordinates[0]); lat = Number(coordinates[1]);
    } else {
      lat = Number(coordinates.latitude ?? coordinates.lat ?? station.latitude ?? report.latitude);
      lon = Number(coordinates.longitude ?? coordinates.lon ?? coordinates.lng ?? station.longitude ?? report.longitude);
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (report.expiresAt && Number.isFinite(new Date(report.expiresAt).getTime()) && new Date(report.expiresAt).getTime() < Date.now()) return null;
    return { stationName: station.name || report.stationName || 'Meldungsort', line: String(line), direction: String(direction), lat, lon };
  }

  async function refreshFreifahrenMapReports(force = false) {
    if (!API.getFreifahrenReports) return freifahrenReports;
    if (!force && freifahrenReportsFetchedAt && Date.now() - freifahrenReportsFetchedAt < 30000) return freifahrenReports;
    if (freifahrenReportsRequest) return freifahrenReportsRequest;
    freifahrenReportsRequest = API.getFreifahrenReports()
      .then((data) => {
        freifahrenReports = (Array.isArray(data.reports) ? data.reports : []).filter((report) => !!getReportMapDetails(report));
        freifahrenReportsFetchedAt = Date.now();
        return freifahrenReports;
      })
      .catch((error) => {
        console.warn('FreiFahren-Kartenmeldungen konnten nicht geladen werden:', error.message);
        return freifahrenReports;
      })
      .finally(() => { freifahrenReportsRequest = null; });
    return freifahrenReportsRequest;
  }

  function findVehicleFreifahrenReport(vehicle) {
    if (!vehicle || vehicle.latitude == null || vehicle.longitude == null) return null;
    const vehicleLine = normalizeMatchText(vehicle.line || vehicle.lineName || '');
    const vehicleDirection = normalizeMatchText(vehicle.direction || '');
    const position = { lat: Number(vehicle.latitude), lon: Number(vehicle.longitude) };
    if (!Number.isFinite(position.lat) || !Number.isFinite(position.lon)) return null;

    let best = null;
    freifahrenReports.forEach((report) => {
      const details = getReportMapDetails(report);
      if (!details) return;
      const reportLine = normalizeMatchText(details.line);
      if (vehicleLine && reportLine && vehicleLine !== reportLine) return;
      if (!vehicleLine || !reportLine) return;
      const reportDirection = normalizeMatchText(details.direction);
      if (vehicleDirection && reportDirection &&
          !vehicleDirection.includes(reportDirection) && !reportDirection.includes(vehicleDirection)) return;
      const distance = distanceBetweenCoordinates(position, { lat: details.lat, lon: details.lon });
      // Nur Fahrzeuge in unmittelbarer Nähe des gemeldeten Halts markieren.
      if (distance > 1300) return;
      if (!best || distance < best.distance) best = { ...details, distance };
    });
    return best;
  }

  function escapePopupText(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[char]));
  }

  function vehiclePopupHtml(v, suspectedReport = null, showTrackButton = false) {
    const line = escapePopupText(v.line || 'Linie unbekannt');
    const direction = escapePopupText(v.direction || 'Fahrtrichtung nicht verfügbar');
    const nextStop = escapePopupText(v.nextStopover || 'Keine Angabe');
    const modeLabel = escapePopupText(v.mode || v.product || v.type || '');
    const coordinates = Number.isFinite(Number(v.latitude)) && Number.isFinite(Number(v.longitude))
      ? `${Number(v.latitude).toFixed(5)}, ${Number(v.longitude).toFixed(5)}`
      : '';
    const rows = [
      modeLabel ? `<div class="vehicle-popup__row"><span>Verkehrsmittel</span><strong>${modeLabel}</strong></div>` : '',
      `<div class="vehicle-popup__row"><span>Fahrtrichtung</span><strong>${direction}</strong></div>`,
      `<div class="vehicle-popup__row"><span>Nächster Halt</span><strong>${nextStop}</strong></div>`,
      coordinates ? `<div class="vehicle-popup__row"><span>Position</span><strong>${coordinates}</strong></div>` : '',
    ].filter(Boolean).join('');
    const kontrolle = suspectedReport
      ? `<div class="vehicle-popup__notice"><strong>ⓘ Kontrolle vermutet</strong><span>Meldung nahe ${escapePopupText(suspectedReport.stationName)}${suspectedReport.direction ? ' · ' + escapePopupText(suspectedReport.direction) : ''}</span></div>`
      : '';
    const trackButton = showTrackButton && v.tripId
      ? '<button type="button" class="vehicle-popup__track">Fahrt live verfolgen</button>'
      : '';
    return `<div class="vehicle-popup"><div class="vehicle-popup__heading">${line}</div>${rows}${kontrolle}${trackButton}</div>`;
  }

  // ---------- Radar-Modus (Standard: alle Fahrzeuge im Ausschnitt) ----------

  async function refreshRadar() {
    if (!map || mode !== 'radar') return;
    const bounds = map.getBounds();

    let data;
    try {
      data = await API.getRadar({
        north: bounds.getNorth().toFixed(5),
        west: bounds.getWest().toFixed(5),
        south: bounds.getSouth().toFixed(5),
        east: bounds.getEast().toFixed(5),
        modes: getModesParam(),
      });
    } catch (err) {
      console.error('Radar-Fehler:', err.message);
      return;
    }

    await refreshFreifahrenMapReports();
    const visibleKeys = new Set();
    data.vehicles.forEach((v) => {
      if (v.latitude == null || v.longitude == null) return;

      // Die Fahrt-ID bleibt bei Positionsänderungen stabil. Fallbacks helfen
      // bei Datenquellen, die statt tripId eine Fahrzeug-ID liefern.
      const markerKey = String(v.tripId || v.vehicleId || v.id || [
        v.line || '', v.direction || '', v.nextStopover || '',
      ].join('|'));
      visibleKeys.add(markerKey);

      const suspectedReport = findVehicleFreifahrenReport(v);
      const popupHtml = vehiclePopupHtml(v, suspectedReport, true);
      let marker = radarMarkers.get(markerKey);

      if (marker) {
        // setLatLng bewegt denselben Leaflet-Marker; ein geöffnetes Popup
        // bleibt daran verankert und wandert mit dem Fahrzeug mit.
        marker.setLatLng([v.latitude, v.longitude]);
        marker.setIcon(vehicleIcon(v.line, v.color, v.textColor, suspectedReport));
        marker.setPopupContent(popupHtml);
        marker._liveNaviVehicle = v;
      } else {
        marker = L.marker([v.latitude, v.longitude], {
          icon: vehicleIcon(v.line, v.color, v.textColor, suspectedReport),
        });
        marker.bindPopup(popupHtml, { maxWidth: 300, autoClose: false, closeOnClick: false });
        marker._liveNaviVehicle = v;
        marker.on('popupopen', () => {
          const button = marker.getPopup()?.getElement()?.querySelector('.vehicle-popup__track');
          if (button) button.addEventListener('click', () => {
            const currentVehicle = marker._liveNaviVehicle;
            if (currentVehicle) isolateVehicle(currentVehicle);
          }, { once: true });
        });
        marker.addTo(radarLayer);
        radarMarkers.set(markerKey, marker);
      }
    });

    // Nur tatsächlich nicht mehr gelieferte Fahrten entfernen. Marker, die
    // weiterhin gemeldet werden, werden oben lediglich aktualisiert.
    radarMarkers.forEach((marker, key) => {
      if (!visibleKeys.has(key)) {
        if (map && marker.isPopupOpen()) map.closePopup(marker.getPopup());
        radarLayer.removeLayer(marker);
        radarMarkers.delete(key);
      }
    });
  }

  function startRadar() {
    init();
    setMode('radar');
    refreshRadar();
    if (radarPollHandle) clearInterval(radarPollHandle);
    radarPollHandle = setInterval(refreshRadar, 15000);
    setTimeout(() => resizeToViewport(), 150);
  }

  function stopRadar() {
    if (radarPollHandle) {
      clearInterval(radarPollHandle);
      radarPollHandle = null;
    }
  }

  // ---------- Isolations-Modus (eine angeklickte Linie live verfolgen) ----------

  async function refreshIsolated() {
    if (!map || mode !== 'isolated' || !currentTripId) return;
    const bounds = map.getBounds();

    let data;
    try {
      data = await API.getRadar({
        north: bounds.getNorth().toFixed(5),
        west: bounds.getWest().toFixed(5),
        south: bounds.getSouth().toFixed(5),
        east: bounds.getEast().toFixed(5),
        tripId: currentTripId,
      });
    } catch (err) {
      console.error('Radar-Fehler (isoliert):', err.message);
      return;
    }

    const v = data.vehicles[0];
    if (!v || v.latitude == null || v.longitude == null) {
      // Fahrzeug gerade nicht meldend (z.B. kurzzeitig aus der Live-Erfassung) -
      // Marker stehen lassen statt zu entfernen, nächster Poll aktualisiert ihn wieder.
      return;
    }

    // WICHTIG: Marker wird wiederverwendet statt bei jedem Poll neu erzeugt zu
    // werden. Vorher wurde hier radarLayer.clearLayers() + ein komplett neuer
    // Marker angelegt - das hat ein ggf. geöffnetes Popup jedes Mal geschlossen,
    // sodass die Fahrzeuginfo (Richtung, nächster Halt) nach dem ersten Klick nie
    // wieder aktualisiert im UI sichtbar wurde.
    if (isolatedMarker) {
      isolatedMarker.setLatLng([v.latitude, v.longitude]);
      isolatedMarker.setIcon(vehicleIcon(v.line, v.color, v.textColor));
      isolatedMarker.setPopupContent(vehiclePopupHtml(v));
    } else {
      isolatedMarker = L.marker([v.latitude, v.longitude], { icon: vehicleIcon(v.line, v.color, v.textColor) });
      isolatedMarker.bindPopup(vehiclePopupHtml(v));
      isolatedMarker.addTo(radarLayer);
    }

    isolatedVehicleMeta = { line: v.line, color: v.color, textColor: v.textColor };
    updateIsolationBanner();
  }

  async function isolateVehicle(vehicle) {
    if (!vehicle || !vehicle.tripId) return;

    // Das ursprüngliche Leaflet-Popup des angeklickten Radar-Markers (aus
    // bindPopup in refreshRadar) schließen, bevor wir in den Isolations-Modus
    // wechseln - sonst blitzt es kurz auf und verschwindet dann kommentarlos.
    map.closePopup();

    setMode('isolated');
    currentTripId = vehicle.tripId;
    isolatedMarker = null;
    radarLayer.clearLayers();
    radarMarkers.clear();

    isolatedVehicleMeta = { line: vehicle.line, color: vehicle.color, textColor: vehicle.textColor };
    updateIsolationBanner();

    // Sofort einen Marker mit den Daten aus dem Klick anzeigen (nicht erst auf
    // den ersten Poll warten) und direkt öffnen, damit man die Fahrzeuginfo
    // ohne weiteren Klick sieht.
    isolatedMarker = L.marker([vehicle.latitude, vehicle.longitude], {
      icon: vehicleIcon(vehicle.line, vehicle.color, vehicle.textColor),
    });
    isolatedMarker.bindPopup(vehiclePopupHtml(vehicle));
    isolatedMarker.addTo(radarLayer);
    isolatedMarker.openPopup();

    routeLayer.clearLayers();
    try {
      const trip = await API.getTrip(vehicle.tripId, { polyline: true });
      if (trip.polyline) {
        const latlngs = polylineToLatLngs(trip.polyline);
        if (latlngs.length > 0) {
          L.polyline(latlngs, { color: vehicle.color || '#F5A623', weight: 5, opacity: 0.85 }).addTo(routeLayer);
        }
      }
    } catch (err) {
      console.error('Trip-Polyline-Fehler:', err.message);
    }

    if (radarPollHandle) clearInterval(radarPollHandle);
    radarPollHandle = setInterval(refreshIsolated, 10000);
  }

  function clearIsolation() {
    currentTripId = null;
    isolatedMarker = null;
    radarMarkers.clear();
    isolatedVehicleMeta = null;
    updateIsolationBanner();
    startRadar();
  }

  function updateIsolationBanner() {
    const banner = document.getElementById('map-isolation-banner');
    if (!banner) return;
    if (!isolatedVehicleMeta) {
      banner.classList.remove('is-visible');
      return;
    }
    const lineEl = document.getElementById('map-isolation-line');
    if (lineEl) {
      lineEl.textContent = isolatedVehicleMeta.line || '?';
      lineEl.style.background = isolatedVehicleMeta.color || '#F5A623';
      lineEl.style.color = isolatedVehicleMeta.textColor || '#fff';
    }
    banner.classList.add('is-visible');
  }

  // ---------- Trip-Modus (bekanntes Fahrzeug aus einer Verbindung heraus verfolgen) ----------

  async function refreshTrip() {
    if (!currentTripId) return;

    let data;
    try {
      data = await API.getTrip(currentTripId, { polyline: !tripMarker });
    } catch (err) {
      console.error('Trip-Fehler:', err.message);
      return;
    }

    if (data.polyline && routeLayer) {
      routeLayer.clearLayers();
      const latlngs = polylineToLatLngs(data.polyline);
      if (latlngs.length > 0) {
        L.polyline(latlngs, { color: data.color || '#F5A623', weight: 4, opacity: 0.7 }).addTo(routeLayer);
        map.fitBounds(L.latLngBounds(latlngs), { padding: [30, 30] });
      }
    }

    if (tripUpdateCallback) {
      tripUpdateCallback({ ...data, tripId: currentTripId });
    }

    if (data.currentLocation) {
      await refreshFreifahrenMapReports();
      const pos = [data.currentLocation.latitude, data.currentLocation.longitude];
      const tripVehicle = { ...data, latitude: data.currentLocation.latitude, longitude: data.currentLocation.longitude };
      const suspectedReport = findVehicleFreifahrenReport(tripVehicle);
      const popupHtml = vehiclePopupHtml(tripVehicle, suspectedReport);
      if (tripMarker) {
        tripMarker.setLatLng(pos);
        tripMarker.setIcon(vehicleIcon(data.line, data.color, data.textColor, suspectedReport));
        // setPopupContent statt erneutem bindPopup, sonst schließt sich ein
        // gerade geöffnetes Popup bei jedem Poll wieder (gleicher Fehler wie
        // im Isolations-Modus).
        if (tripMarker.getPopup()) tripMarker.setPopupContent(popupHtml);
        else tripMarker.bindPopup(popupHtml);
      } else {
        tripMarker = L.marker(pos, { icon: vehicleIcon(data.line, data.color, data.textColor) }).addTo(routeLayer);
        tripMarker.bindPopup(popupHtml);
      }
    }
  }

  function trackTrip(tripId) {
    init();
    setMode('trip');
    currentTripId = tripId;
    tripMarker = null;
    routeLayer.clearLayers();

    refreshTrip();
    if (tripPollHandle) clearInterval(tripPollHandle);
    tripPollHandle = setInterval(refreshTrip, 10000);
    setTimeout(() => resizeToViewport(), 150);
  }

  function stopTracking() {
    if (tripPollHandle) {
      clearInterval(tripPollHandle);
      tripPollHandle = null;
    }
    currentTripId = null;
    tripMarker = null;
    if (tripUpdateCallback) tripUpdateCallback(null);
  }

  // ---------- Standort ----------

  function locateUser() {
    init();
    if (!navigator.geolocation) {
      alert('Geolocation wird von diesem Browser nicht unterstützt.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        userLayer.clearLayers();
        L.marker([latitude, longitude], {
          icon: L.divIcon({ className: 'user-location-marker', iconSize: [16, 16] }),
        }).addTo(userLayer);
        map.setView([latitude, longitude], 16);
      },
      (err) => alert('Standort konnte nicht ermittelt werden: ' + err.message),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  // ---------- Modus-Verwaltung ----------

  function setMode(newMode) {
    if (mode === newMode) return;
    if (mode === 'radar') stopRadar();
    if (mode === 'isolated') stopRadar();
    if (mode === 'trip') stopTracking();
    if (newMode === 'radar') routeLayer.clearLayers();
    mode = newMode;
  }

  function startPolling() {
    // Rückwärtskompatibler Einstieg: Karten-Tab wurde geöffnet.
    if (mode === 'radar' || mode === 'idle') startRadar();
    else if (map) setTimeout(() => resizeToViewport(), 150);
  }

  function stopPolling() {
    stopRadar();
    stopTracking();
  }

  // ---------- Mini-Karte für Verbindungsvorschau (Routenplaner) ----------

  function createMiniMap(containerId, journey) {
    const miniMap = L.map(containerId, {
      zoomControl: false,
      attributionControl: false,
      dragging: true,
      scrollWheelZoom: false,
      tap: true,
    }).setView([52.5200, 13.4050], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap-Mitwirkende',
      maxZoom: 19,
    }).addTo(miniMap);

    const allPoints = [];
    (journey.legs || []).forEach((leg) => {
      if (!leg.polyline) return;
      const latlngs = polylineToLatLngs(leg.polyline);
      if (latlngs.length === 0) return;
      L.polyline(latlngs, {
        color: leg.walking ? '#8E99A6' : leg.color || '#F5A623',
        weight: leg.walking ? 3 : 4,
        dashArray: leg.walking ? '5, 7' : null,
        opacity: 0.9,
      }).addTo(miniMap);
      allPoints.push(...latlngs);
    });

    if (allPoints.length > 0) {
      miniMap.fitBounds(L.latLngBounds(allPoints), { padding: [16, 16] });
    }

    setTimeout(() => miniMap.invalidateSize(), 50);
    return miniMap;
  }

  return {
    startPolling,
    stopPolling,
    trackTrip,
    setTripUpdateCallback(callback) {
      tripUpdateCallback = typeof callback === 'function' ? callback : null;
    },
    setModeFilter,
    clearIsolation,
    locateUser,
    createMiniMap,
  };
})();
