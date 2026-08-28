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
     * Nutzt unsere selbst gehostete OTP2-Instanz (VBB-Region) statt HAFAS.
     * `from`/`to` brauchen nur noch { lat, lon, name } - egal ob Haltestelle,
     * Adresse, POI oder GPS-Standort, alle liefern das bereits mit.
     */
    getJourneys({ from, to, when, arrival, polylines, results = 5 }) {
      return request(
        `/otp/journeys?${qs({
          fromLat: from.lat,
          fromLon: from.lon,
          toLat: to.lat,
          toLon: to.lon,
          when: when || undefined,
          arrival: arrival ? 'true' : undefined,
          polylines: polylines ? 'true' : undefined,
          results,
        })}`,
      );
    },

    getFares() {
      return request('/fares');
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
  };
})();