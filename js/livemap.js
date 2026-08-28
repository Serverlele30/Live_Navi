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
  let routeLayer = null;
  let userLayer = null;
  let tripMarker = null;

  let mode = 'radar';
  let radarPollHandle = null;
  let tripPollHandle = null;
  let currentTripId = null;
  let isolatedVehicleMeta = null; // { line, color, textColor } für die Banner-Anzeige
  let getModesParam = () => null; // wird von außen (ModeFilter) gesetzt

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
  }

  function setModeFilter(fn) {
    getModesParam = fn;
  }

  function vehicleIcon(label, bg, fg) {
    return L.divIcon({
      className: 'vehicle-marker',
      html: `<span style="background:${bg || '#F5A623'};color:${fg || '#fff'};">${label || '?'}</span>`,
      iconSize: [null, null],
    });
  }

  function polylineToLatLngs(geojson) {
    if (!geojson || !geojson.features) return [];
    return geojson.features.map((f) => [f.geometry.coordinates[1], f.geometry.coordinates[0]]);
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

    radarLayer.clearLayers();
    data.vehicles.forEach((v) => {
      if (v.latitude == null || v.longitude == null) return;
      const marker = L.marker([v.latitude, v.longitude], { icon: vehicleIcon(v.line, v.color, v.textColor) });
      marker.bindPopup(
        `<strong>${v.line || 'Linie unbekannt'}</strong><br>${v.direction || ''}<br>` +
          `<small>Nächster Halt: ${v.nextStopover || '–'}</small>`,
      );
      // Klick auf eine Linie: isoliert sie (alle anderen Fahrzeuge ausblenden,
      // Streckenverlauf einzeichnen, live weiterverfolgen).
      marker.on('click', () => isolateVehicle(v));
      marker.addTo(radarLayer);
    });
  }

  function startRadar() {
    init();
    setMode('radar');
    refreshRadar();
    if (radarPollHandle) clearInterval(radarPollHandle);
    radarPollHandle = setInterval(refreshRadar, 15000);
    setTimeout(() => map && map.invalidateSize(), 150);
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

    radarLayer.clearLayers();
    const v = data.vehicles[0];
    if (v && v.latitude != null && v.longitude != null) {
      const marker = L.marker([v.latitude, v.longitude], { icon: vehicleIcon(v.line, v.color, v.textColor) });
      marker.bindPopup(`<strong>${v.line || ''}</strong><br>${v.direction || ''}<br><small>Nächster Halt: ${v.nextStopover || '–'}</small>`);
      marker.addTo(radarLayer);
    }
  }

  async function isolateVehicle(vehicle) {
    if (!vehicle || !vehicle.tripId) return;
    setMode('isolated');
    currentTripId = vehicle.tripId;
    isolatedVehicleMeta = { line: vehicle.line, color: vehicle.color, textColor: vehicle.textColor };
    updateIsolationBanner();

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

    refreshIsolated();
    if (radarPollHandle) clearInterval(radarPollHandle);
    radarPollHandle = setInterval(refreshIsolated, 10000);
  }

  function clearIsolation() {
    currentTripId = null;
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

    if (data.currentLocation) {
      const pos = [data.currentLocation.latitude, data.currentLocation.longitude];
      if (tripMarker) {
        tripMarker.setLatLng(pos);
      } else {
        tripMarker = L.marker(pos, { icon: vehicleIcon(data.line, data.color, data.textColor) }).addTo(routeLayer);
      }
      tripMarker.bindPopup(`<strong>${data.line || ''}</strong><br>→ ${data.direction || ''}`);
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
    setTimeout(() => map && map.invalidateSize(), 150);
  }

  function stopTracking() {
    if (tripPollHandle) {
      clearInterval(tripPollHandle);
      tripPollHandle = null;
    }
    currentTripId = null;
    tripMarker = null;
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
    else if (map) setTimeout(() => map.invalidateSize(), 150);
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
    setModeFilter,
    clearIsolation,
    locateUser,
    createMiniMap,
  };
})();
