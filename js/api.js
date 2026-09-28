// Schlanker Wrapper um alle Aufrufe an das ÖPNV-Navi-Backend.
// Wirft bei Fehlern verständliche Errors, die die UI direkt anzeigen kann.

const API = (() => {
  const BASE = window.APP_CONFIG.API_BASE;

  async function request(path, options = {}) {
    let response;
    try {
      response = await fetch(`${BASE}${path}`, options);
    } catch (networkErr) {
      throw new Error('Backend nicht erreichbar. Prüfe deine Internetverbindung.');
    }

    if (!response.ok) {
      let message = `Fehler ${response.status}`;
      try {
        const body = await response.json();
        if (body.error) message = body.error;
      } catch (_) {
        // Antwort war kein JSON, Standardmeldung behalten
      }
      throw new Error(message);
    }

    return response.json();
  }

  function postJson(path, body) {
    return request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  function deleteJson(path, body) {
    return request(path, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  // Baut einen Query-String und lässt dabei undefined/null-Werte weg.
  function qs(params) {
    const parts = [];
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    });
    return parts.join('&');
  }

  return {
    searchLocations(query) {
      return request(`/locations/search?query=${encodeURIComponent(query)}`);
    },

    // Bundesweite DB-IRIS-Anbindung: nur "echte" DB-Bahnhöfe (Fernverkehr +
    // viele Regio-Stationen), OHNE U-Bahn/Tram/Bus - siehe searchAll().
    searchDbStations(query) {
      return request(`/db/stations/search?query=${encodeURIComponent(query)}`);
    },

    /**
     * Kombinierte Suche: fragt VBB (U-Bahn/S-Bahn/Tram/Bus, primär Berlin/
     * Brandenburg) UND die bundesweite DB-Anbindung (nur echte Bahnhöfe)
     * parallel ab und liefert eine gemeinsame, quellenmarkierte Liste zurück.
     * So funktioniert Nahverkehr weiterhin lokal, und man bekommt zusätzlich
     * bundesweite Fernverkehrs-/Regio-Bahnhöfe.
     */
    async searchAll(query) {
      const [vbbResult, dbResult] = await Promise.allSettled([
        this.searchLocations(query),
        this.searchDbStations(query),
      ]);

      const vbbStations = vbbResult.status === 'fulfilled'
        ? vbbResult.value.locations
          .filter((l) => l.kind === 'stop')
          .map((l) => ({ id: l.id, name: l.name, source: 'vbb' }))
        : [];

      const dbStations = dbResult.status === 'fulfilled'
        ? dbResult.value.stations.map((s) => ({ id: s.evaNumber, name: s.name, source: 'db' }))
        : [];

      return [...vbbStations, ...dbStations];
    },

    getDbDepartures(evaNumber, { hours = 2, results = 20 } = {}) {
      return request(`/db/departures/${encodeURIComponent(evaNumber)}?${qs({ hours, results })}`);
    },

    nearby({ lat, lon, distance, results, includePoi }) {
      return request(`/locations/nearby?${qs({ lat, lon, distance, results, includePoi })}`);
    },

    getDepartures(stationId, { duration = 30, results = 15, modes } = {}) {
      return request(`/departures/${encodeURIComponent(stationId)}?${qs({ duration, results, modes })}`);
    },

    /**
     * Nutzt dieselbe HAFAS-Anbindung (VBB + Deutsche Bahn) wie die iOS-App.
     * `from`/`to` brauchen { lat, lon, name }. `vias` ist eine Liste von bis
     * zu 3 Zwischenhalten ({ lat, lon, name, waitMinutes }), in Reihenfolge
     * der Route. Sobald mindestens ein Via gesetzt ist, verkettet das
     * Backend mehrere Einzelabfragen - dann gelten immer "Abfahrt um" sowie
     * feste results=1 pro Abschnitt, und earlierRef/laterRef liefern null
     * zurück (siehe routes/journeys.js im Backend).
     * `earlierRef`/`laterRef` laden, aus einer vorherigen Antwort übernommen,
     * die nächste bzw. vorherige Seite an Verbindungen nach (ohne Vias).
     * Gibt die volle Antwort zurück ({ journeys, earlierRef, laterRef }).
     */
    getJourneys({
      from, to, when, arrival, polylines, results = 5,
      wheelchair, modes, bike, vias = [], earlierRef, laterRef,
    }) {
      const params = {
        fromLat: from.lat,
        fromLon: from.lon,
        fromName: from.name || undefined,
        toLat: to.lat,
        toLon: to.lon,
        toName: to.name || undefined,
        results,
        polylines: polylines ? 'true' : undefined,
        accessibility: wheelchair ? 'true' : undefined,
        modes: modes || undefined,
        bike: bike ? 'true' : undefined,
      };

      if (earlierRef) {
        params.earlierRef = earlierRef;
      } else if (laterRef) {
        params.laterRef = laterRef;
      } else if (when) {
        params.when = when;
        if (arrival) params.arrival = 'true';
      }

      vias.slice(0, 3).forEach((via, i) => {
        params[`via${i}Lat`] = via.lat;
        params[`via${i}Lon`] = via.lon;
        if (via.name) params[`via${i}Name`] = via.name;
        if (via.waitMinutes) params[`via${i}WaitMinutes`] = via.waitMinutes;
      });

      return request(`/journeys?${qs(params)}`);
    },

    getFares() {
      return request('/fares');
    },

    // Einfacher Verbindungstest gegen den Health-Dashboard-Endpoint, analog
    // zu APIClient.checkHealth() in der iOS-App - prüft nur, ob das Backend
    // erreichbar ist (Reverse-Proxy/DNS/VPS korrekt konfiguriert).
    checkHealth() {
      return request('/health/full');
    },

    getNearbyDisruptions({ lat, lon, distance, stops }) {
      return request(`/disruptions/nearby?${qs({ lat, lon, distance, stops })}`);
    },

    getTrip(tripId, { polyline = false } = {}) {
      return request(`/trip/${encodeURIComponent(tripId)}?${qs({ polyline: polyline ? 'true' : undefined })}`);
    },

    getRemarks({ modes, results = 30 } = {}) {
      return request(`/remarks?${qs({ modes, results })}`);
    },

    getRadar({ north, west, south, east, modes, tripId }) {
      return request(`/radar?${qs({ north, west, south, east, modes, tripId })}`);
    },

    // Nächste Abfahrt für mehrere Haltestellen gleichzeitig (z.B. für die
    // Favoriten-Übersicht auf der Startseite) - eine Anfrage statt N.
    getSummaryDepartures(stations) {
      return postJson('/summary/departures', { stations });
    },

    // Verspätungsstatistik pro Linie (siehe backend/src/utils/delayStats.js) -
    // "sufficientData: false" bedeutet: noch zu wenige Datenpunkte gesammelt.
    getLineDelayStats(line, days = 14) {
      return request(`/stats/delays/${encodeURIComponent(line)}?${qs({ days })}`);
    },

    // Web-Push (siehe js/push.js + backend/src/routes/webPush.js)
    getPushPublicKey() {
      return request('/webpush/public-key');
    },
    subscribePush(subscription, favorites) {
      return postJson('/webpush/subscribe', { subscription, favorites });
    },
    unsubscribePush(endpoint) {
      return postJson('/webpush/unsubscribe', { endpoint });
    },
    setPushTripAlarm(endpoint, alarm) {
      return postJson('/webpush/trip-alarm', { endpoint, ...alarm });
    },
    clearPushTripAlarm(endpoint) {
      return deleteJson('/webpush/trip-alarm', { endpoint });
    },
  };
})();