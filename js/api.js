// Schlanker Wrapper um alle Aufrufe an das ÖPNV-Navi-Backend.
// Wirft bei Fehlern verständliche Errors, die die UI direkt anzeigen kann.

const API = (() => {
  const BASE = window.APP_CONFIG.API_BASE;

  async function request(path) {
    let response;
    try {
      response = await fetch(`${BASE}${path}`);
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

    nearby({ lat, lon, distance, results, includePoi }) {
      return request(`/locations/nearby?${qs({ lat, lon, distance, results, includePoi })}`);
    },

    getDepartures(stationId, { duration = 30, results = 15, modes } = {}) {
      return request(`/departures/${encodeURIComponent(stationId)}?${qs({ duration, results, modes })}`);
    },

    /**
     * `from`/`to` sind entweder { id, name } (Haltestelle) oder
     * { lat, lon, name } (Adresse/POI/GPS-Standort, wird als Adresse behandelt).
     */
    getJourneys({ from, to, when, arrival, modes, polylines, results = 5 }) {
      const fromParams = from.id
        ? { fromId: from.id }
        : { fromLat: from.lat, fromLon: from.lon, fromAddress: from.name };
      const toParams = to.id
        ? { toId: to.id }
        : { toLat: to.lat, toLon: to.lon, toAddress: to.name };

      return request(
        `/journeys?${qs({
          ...fromParams,
          ...toParams,
          when: when || undefined,
          arrival: arrival ? 'true' : undefined,
          modes,
          polylines: polylines ? 'true' : undefined,
          results,
        })}`,
      );
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
  };
})();