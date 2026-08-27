const App = (() => {
  const FAVORITES_KEY = 'oepnv-navi:favorites';
  const LAST_STOP_KEY = 'oepnv-navi:last-stop';
  const RECENT_SEARCHES_KEY = 'oepnv-navi:recent-searches';

  let currentStop = null;
  let departuresPollHandle = null;
  let departuresModeFilter = null;
  let journeyModeFilter = null;

  let journeyFrom = null;
  let journeyTo = null;
  let journeyArrivalMode = false;
  let lastJourneyParams = null;
  let remarksLoadedOnce = false;

  function loadFavorites() {
    try {
      return JSON.parse(localStorage.getItem(FAVORITES_KEY)) || [];
    } catch (_) {
      return [];
    }
  }

  function saveFavorites(favorites) {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  }

  function isFavorite(stationId) {
    return loadFavorites().some((f) => f.id === stationId);
  }

  function loadRecentSearches() {
    try { return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY)) || []; }
    catch (_) { return []; }
  }

  function saveRecentSearch(station) {
    if (!station || !station.name) return;
    const items = loadRecentSearches().filter((item) => item.id !== station.id);
    items.unshift({ id: station.id, name: station.name, latitude: station.latitude, longitude: station.longitude });
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(items.slice(0, 6)));
    renderRecentSearches();
  }

  function renderRecentSearches() {
    const container = document.getElementById('recent-searches');
    if (!container) return;
    const items = loadRecentSearches();
    container.innerHTML = '';
    if (!items.length) {
      container.innerHTML = '<div class="recent-empty">Noch keine Suchen.</div>';
      return;
    }
    items.forEach((item) => {
      const button = document.createElement('button');
      button.className = 'recent-item';
      button.innerHTML = `<span>↺</span><strong>${escapeHtml(item.name)}</strong>`;
      button.addEventListener('click', () => selectStation(item));
      container.appendChild(button);
    });
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
  }

  function toggleFavorite(station) {
    const favorites = loadFavorites();
    const idx = favorites.findIndex((f) => f.id === station.id);
    if (idx >= 0) {
      favorites.splice(idx, 1);
    } else {
      favorites.push(station);
    }
    saveFavorites(favorites);
    renderFavoriteChips();
    renderRecentSearches();
    updateFavoriteButton();
  }

  function renderFavoriteChips() {
    const container = document.getElementById('favorite-chips');
    const cardContainer = document.getElementById('favorite-cards');
    const favorites = loadFavorites();
    if (container) container.innerHTML = '';
    if (cardContainer) cardContainer.innerHTML = '';

    favorites.forEach((fav) => {
      if (container) {
        const chip = document.createElement('button');
        chip.className = 'chip';
        chip.textContent = fav.name;
        chip.addEventListener('click', () => selectStation(fav));
        container.appendChild(chip);
      }
      if (cardContainer) {
        const card = document.createElement('button');
        card.className = 'favorite-card';
        card.innerHTML = `<span class="favorite-card__star">★</span><span><strong>${escapeHtml(fav.name)}</strong><small>Abfahrten anzeigen</small></span><span class="favorite-card__arrow">→</span>`;
        card.addEventListener('click', () => selectStation(fav));
        cardContainer.appendChild(card);
      }
    });

    const empty = document.getElementById('favorites-empty-hint');
    if (empty) empty.hidden = favorites.length > 0;
    const home = document.getElementById('favorites-home');
    if (home) home.hidden = favorites.length === 0;
  }

  function updateFavoriteButton() {
    const btn = document.getElementById('favorite-toggle');
    if (!currentStop) {
      btn.hidden = true;
      return;
    }
    btn.hidden = false;
    const active = isFavorite(currentStop.id);
    btn.textContent = active ? '★ Favorit' : '☆ Favorit';
    btn.classList.toggle('is-active', active);
  }

  function getUserLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation wird von diesem Browser nicht unterstützt.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        (err) => reject(new Error('Standort konnte nicht ermittelt werden: ' + err.message)),
        { enableHighAccuracy: true, timeout: 10000 },
      );
    });
  }

  let searchDebounce = null;

  function initSearch() {
    const input = document.getElementById('station-search');
    const results = document.getElementById('search-results');

    input.addEventListener('input', () => {
      const clear = document.getElementById('search-clear');
      if (clear) clear.hidden = input.value.length === 0;
      clearTimeout(searchDebounce);
      const query = input.value.trim();

      if (query.length < 2) {
        results.hidden = true;
        results.innerHTML = '';
        return;
      }

      searchDebounce = setTimeout(async () => {
        try {
          const { locations } = await API.searchLocations(query);
          const stops = locations.filter((l) => l.kind === 'stop');
          renderSearchResults(results, stops, (station) => {
            selectStation(station);
            input.value = '';
            results.hidden = true;
          });
        } catch (err) {
          console.error('Suchfehler:', err.message);
        }
      }, 250);
    });

    const clear = document.getElementById('search-clear');
    if (clear) clear.addEventListener('click', () => { input.value = ''; results.hidden = true; clear.hidden = true; input.focus(); });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-box')) {
        results.hidden = true;
      }
    });
  }

  function kindIcon(kind) {
    if (kind === 'address') return '📍';
    if (kind === 'poi') return '⭐';
    return '🚏';
  }

  function renderSearchResults(container, locations, onSelect) {
    container.innerHTML = '';

    if (locations.length === 0) {
      container.innerHTML = '<li class="search-result search-result--empty">Keine Treffer</li>';
      container.hidden = false;
      return;
    }

    locations.forEach((loc) => {
      const li = document.createElement('li');
      li.className = 'search-result';
      li.innerHTML = `<span class="search-result__icon">${kindIcon(loc.kind)}</span> ${loc.name}`;
      li.addEventListener('click', () => onSelect(loc));
      container.appendChild(li);
    });

    container.hidden = false;
  }

  function selectStation(station) {
    currentStop = station;
    localStorage.setItem(LAST_STOP_KEY, JSON.stringify({ id: station.id, name: station.name }));
    saveRecentSearch(station);
    activateTab('departures');
    document.getElementById('board-station-name').textContent = station.name;
    document.getElementById('board-empty-state').hidden = true;
    document.getElementById('welcome-panel').hidden = true;
    document.getElementById('departures-view').hidden = false;
    updateFavoriteButton();
    loadDepartures();
    restartDeparturesPolling();
  }

  async function loadDepartures() {
    if (!currentStop) return;
    const board = document.getElementById('departure-board');

    try {
      const { departures } = await API.getDepartures(currentStop.id, {
        modes: departuresModeFilter ? departuresModeFilter.getModesParam() : null,
      });
      renderDepartureBoard(departures);
    } catch (err) {
      board.innerHTML = `<div class="board-error">⚠ ${err.message}</div>`;
    }
  }
    function renderDepartureBoard(departures) {
    const board = document.getElementById('departure-board');

    if (departures.length === 0) {
      board.innerHTML = '<div class="board-empty">Keine Abfahrten für die gewählten Verkehrsmittel in den nächsten 30 Minuten.</div>';
      return;
    }

    const existingRows = board.querySelectorAll('.flap-row');
    if (existingRows.length !== departures.length) {
      board.innerHTML = '';
      departures.forEach((dep, i) => {
        board.appendChild(buildDepartureRow(dep, i));
      });
    }

    departures.forEach((dep, i) => {
      updateDepartureRow(board.children[i], dep);
    });
  }

  function buildDepartureRow(dep, index) {
    const row = document.createElement('div');
    row.className = 'flap-row';
    row.style.setProperty('--row-index', index);
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.innerHTML = `
      <div class="flap-field flap-field--line">
        <span class="flap-label">Linie</span>
        <span class="flap-cell flap-cell--line" data-field="line"></span>
      </div>
      <div class="flap-field flap-field--direction">
        <span class="flap-label">Ziel</span>
        <span class="flap-cell flap-cell--direction" data-field="direction"></span>
      </div>
      <div class="flap-field flap-field--platform">
        <span class="flap-label">Gleis</span>
        <span class="flap-cell flap-cell--platform" data-field="platform"></span>
      </div>
      <div class="flap-field flap-field--time">
        <span class="flap-label">Abfahrt</span>
        <span class="flap-cell flap-cell--time" data-field="time"></span>
      </div>
    `;
    const openModal = () => {
      if (row.dataset.tripId) TripModal.open(row.dataset.tripId);
    };
    row.addEventListener('click', openModal);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openModal();
      }
    });
    return row;
  }

  function updateDepartureRow(row, dep) {
    row.dataset.tripId = dep.tripId || '';

    const minutesUntil = dep.when
      ? Math.max(0, Math.round((new Date(dep.when) - new Date()) / 60000))
      : null;

    const timeText = dep.cancelled
      ? 'FAELLT AUS'
      : minutesUntil !== null
        ? `${String(minutesUntil).padStart(2, '0')} MIN`
        : '-- MIN';

    row.classList.toggle('flap-row--delayed', !!dep.delay && dep.delay > 0);
    row.classList.toggle('flap-row--cancelled', !!dep.cancelled);

    const lineCell = row.querySelector('[data-field="line"]');
    lineCell.style.setProperty('--line-color', dep.color || '#8E99A6');
    lineCell.style.setProperty('--line-text-color', dep.textColor || '#fff');

    SplitFlap.render(lineCell, (dep.line || '?').toUpperCase());
    SplitFlap.render(row.querySelector('[data-field="direction"]'), (dep.direction || '').toUpperCase());
    SplitFlap.render(row.querySelector('[data-field="platform"]'), (dep.platform || '-').toUpperCase());

    const timeCell = row.querySelector('[data-field="time"]');
    if (dep.cancelled) {
      const plannedTime = dep.plannedWhen
        ? new Date(dep.plannedWhen).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
        : '';
      if (timeCell.dataset.cancelledPlanned !== plannedTime) {
        timeCell.dataset.cancelledPlanned = plannedTime;
        timeCell.classList.add('flap-cell--time-cancelled');
        timeCell.innerHTML = `
          <span class="cancelled-flag">FÄLLT AUS</span>
          <span class="cancelled-original">urspr. ${plannedTime}</span>
        `;
      }
    } else {
      delete timeCell.dataset.cancelledPlanned;
      timeCell.classList.remove('flap-cell--time-cancelled');
      SplitFlap.render(timeCell, timeText);
    }
  }

  function restartDeparturesPolling() {
    if (departuresPollHandle) clearInterval(departuresPollHandle);
    departuresPollHandle = setInterval(loadDepartures, 30000);
  }

  function initTabs() {
    document.querySelectorAll('[data-tab]').forEach((tab) => {
      tab.addEventListener('click', () => activateTab(tab.dataset.tab));
    });
  }

  function activateTab(tabName) {
    document.querySelectorAll('.tab-button, .mobile-nav__item').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      panel.hidden = panel.dataset.tabPanel !== tabName;
    });

    if (tabName === 'map') {
      LiveMap.startPolling();
    } else {
      LiveMap.stopPolling();
    }

    if (tabName === 'disruptions' && !remarksLoadedOnce) {
      loadRemarks();
    }
  }

  function initNearby() {
    document.getElementById('welcome-nearby').addEventListener('click', () => { activateTab('nearby'); document.getElementById('nearby-locate').click(); });
    document.getElementById('welcome-route').addEventListener('click', () => activateTab('journey'));
    document.getElementById('nearby-home-open').addEventListener('click', () => activateTab('nearby'));
    document.getElementById('nearby-locate').addEventListener('click', async () => {
      const listEl = document.getElementById('nearby-list');
      listEl.innerHTML = '<div class="board-empty">Standort wird ermittelt…</div>';

      try {
        const { lat, lon } = await getUserLocation();
        const { locations } = await API.nearby({ lat, lon, distance: 1000, results: 15 });
        renderNearbyList(locations, listEl);
        renderNearbyPreview(locations);
      } catch (err) {
        listEl.innerHTML = `<div class="board-error">⚠ ${err.message}</div>`;
      }
    });
  }

  function renderNearbyPreview(locations) {
    const container = document.getElementById('nearby-home-list');
    if (!container) return;
    container.innerHTML = '';
    locations.slice(0, 3).forEach((loc) => {
      const item = document.createElement('button');
      item.className = 'nearby-preview__item';
      item.innerHTML = `<span><strong>${escapeHtml(loc.name)}</strong><small>🚏 Haltestelle</small></span><b>${loc.distance != null ? loc.distance + ' m' : '→'}</b>`;
      item.addEventListener('click', () => { selectStation(loc); activateTab('departures'); });
      container.appendChild(item);
    });
    document.getElementById('nearby-home').hidden = locations.length === 0;
  }

  async function loadNearbyPreview() {
    const home = document.getElementById('nearby-home');
    const list = document.getElementById('nearby-home-list');
    if (!navigator.geolocation || !home || !list) return;
    list.innerHTML = '<div class="recent-empty">Standort wird ermittelt…</div>';
    try {
      const { lat, lon } = await getUserLocation();
      const { locations } = await API.nearby({ lat, lon, distance: 1000, results: 3 });
      renderNearbyPreview(locations);
    } catch (_) {
      home.hidden = true;
    }
  }

  function renderNearbyList(locations, container) {
    container.innerHTML = '';

    if (locations.length === 0) {
      container.innerHTML = '<div class="board-empty">Keine Haltestellen in der Nähe gefunden.</div>';
      return;
    }

    locations.forEach((loc) => {
      const item = document.createElement('button');
      item.className = 'nearby-item';
      item.innerHTML = `
        <span class="nearby-item__name">${loc.name}</span>
        <span class="nearby-item__distance">${loc.distance != null ? loc.distance + ' m' : ''}</span>
      `;
      item.addEventListener('click', () => {
        selectStation(loc);
        activateTab('departures');
      });
      container.appendChild(item);
    });
  }

  async function loadRemarks() {
    const container = document.getElementById('remarks-list');
    container.innerHTML = '<div class="board-empty">Lade Störungsmeldungen…</div>';

    try {
      const { remarks } = await API.getRemarks({ results: 30 });
      remarksLoadedOnce = true;
      renderRemarks(remarks, container);
    } catch (err) {
      container.innerHTML = `<div class="board-error">⚠ ${err.message}</div>`;
    }
  }

  function renderRemarks(remarks, container) {
    container.innerHTML = '';

    if (remarks.length === 0) {
      container.innerHTML = '<div class="board-empty">Aktuell keine Störungsmeldungen bekannt.</div>';
      return;
    }

    remarks.forEach((r) => {
      const card = document.createElement('div');
      card.className = 'remark-card';
      card.innerHTML = `
        <div class="remark-card__summary">⚠ ${r.summary || 'Hinweis'}</div>
        <div class="remark-card__text">${r.text || ''}</div>
        <div class="remark-card__meta">${r.company || ''}</div>
      `;
      container.appendChild(card);
    });
  }
  function initJourneyPlanner() {
    setupJourneyInput('journey-from', (loc) => (journeyFrom = loc));
    setupJourneyInput('journey-to', (loc) => (journeyTo = loc));

    document.getElementById('journey-use-location').addEventListener('click', async () => {
      const input = document.getElementById('journey-from');
      input.value = 'Standort wird ermittelt…';
      try {
        const { lat, lon } = await getUserLocation();
        journeyFrom = { lat, lon, name: 'Mein Standort' };
        input.value = 'Mein Standort';
      } catch (err) {
        input.value = '';
        alert(err.message);
      }
    });

    document.querySelectorAll('.when-choice').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.when-choice').forEach((item) => item.classList.remove('is-active'));
        button.classList.add('is-active');
        const mode = button.dataset.when;
        journeyArrivalMode = mode === 'arrival';
        const when = document.getElementById('journey-when');
        when.hidden = mode === 'now';
        if (mode !== 'now' && !when.value) {
          const d = new Date(Date.now() + 10 * 60000);
          d.setSeconds(0, 0);
          when.value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,16);
        }
      });
    });

    document.getElementById('journey-submit').addEventListener('click', async () => {
      const resultsEl = document.getElementById('journey-results');

      if (!journeyFrom || !journeyTo) {
        resultsEl.innerHTML = '<div class="board-error">Bitte Start und Ziel aus der Liste auswählen.</div>';
        return;
      }

      resultsEl.innerHTML = '<div class="board-empty">Suche Verbindungen…</div>';

      const whenInput = document.getElementById('journey-when').value;
      const params = {
        from: journeyFrom,
        to: journeyTo,
        when: whenInput || undefined,
        arrival: journeyArrivalMode,
        modes: journeyModeFilter ? journeyModeFilter.getModesParam() : null,
        results: 5,
      };
      lastJourneyParams = params;

      try {
        const { journeys } = await API.getJourneys(params);
        renderJourneys(journeys, resultsEl);
      } catch (err) {
        resultsEl.innerHTML = `<div class="board-error">⚠ ${err.message}</div>`;
      }
    });
  }

  function setupJourneyInput(inputId, onSelect) {
    const input = document.getElementById(inputId);
    const results = document.getElementById(`${inputId}-results`);
    let debounce = null;

    input.addEventListener('input', () => {
      clearTimeout(debounce);
      const query = input.value.trim();
      if (query.length < 2) {
        results.hidden = true;
        return;
      }
      debounce = setTimeout(async () => {
        try {
          const { locations } = await API.searchLocations(query);
          renderSearchResults(results, locations, (loc) => {
            onSelect({ id: loc.id || undefined, lat: loc.latitude, lon: loc.longitude, name: loc.name });
            input.value = loc.name;
            results.hidden = true;
          });
        } catch (err) {
          console.error('Suchfehler:', err.message);
        }
      }, 250);
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest(`#${inputId}`) && !e.target.closest(`#${inputId}-results`)) {
        results.hidden = true;
      }
    });
  }

  function renderJourneys(journeys, container) {
    container.innerHTML = '';

    if (journeys.length === 0) {
      container.innerHTML = '<div class="board-empty">Keine Verbindungen gefunden.</div>';
      return;
    }

    journeys.forEach((journey, journeyIndex) => {
      const card = document.createElement('div');
      card.className = 'journey-card';

      const legsHtml = journey.legs
        .map((leg) => {
          const depTime = leg.departure ? new Date(leg.departure).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
          const arrTime = leg.arrival ? new Date(leg.arrival).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
          const lineLabel = leg.walking ? 'Fußweg' : leg.line;
          const lineStyle = leg.walking
            ? ''
            : `style="background:${leg.color || '#8E99A6'};color:${leg.textColor || '#fff'};"`;
          const trackBtn = !leg.walking && leg.tripId
            ? `<button class="leg-track-btn" data-trip-id="${leg.tripId}" data-action="live">📡 Live</button>`
            : '';
          const infoBtn = !leg.walking && leg.tripId
            ? `<button class="leg-track-btn" data-trip-id="${leg.tripId}" data-action="info">ℹ Details</button>`
            : '';
          return `
            <div class="journey-leg ${leg.walking ? 'journey-leg--walk' : ''}">
              <span class="journey-leg__line" ${lineStyle}>${lineLabel}</span>
              <span class="journey-leg__route">${leg.origin || ''} → ${leg.destination || ''}</span>
              <span class="journey-leg__time">${depTime} – ${arrTime}</span>
              ${infoBtn}
              ${trackBtn}
            </div>
          `;
        })
        .join('');

      card.innerHTML = `
        ${legsHtml}
        <button class="journey-map-toggle" data-journey-index="${journeyIndex}">🗺️ Streckenverlauf anzeigen</button>
        <div class="journey-mini-map" id="journey-mini-map-${journeyIndex}"></div>
      `;

      card.querySelector('.journey-map-toggle').addEventListener('click', (e) => {
        toggleJourneyMiniMap(journeyIndex, journey, e.currentTarget);
      });
      card.querySelectorAll('.leg-track-btn[data-action="live"]').forEach((btn) => {
        btn.addEventListener('click', () => {
          LiveMap.trackTrip(btn.dataset.tripId);
          activateTab('map');
        });
      });
      card.querySelectorAll('.leg-track-btn[data-action="info"]').forEach((btn) => {
        btn.addEventListener('click', () => TripModal.open(btn.dataset.tripId));
      });

      container.appendChild(card);
    });
  }

  let openMiniMapIndex = null;
  let miniMapInstance = null;

  async function toggleJourneyMiniMap(journeyIndex, journeyFallback, button) {
    const mapEl = document.getElementById(`journey-mini-map-${journeyIndex}`);

    if (openMiniMapIndex === journeyIndex) {
      mapEl.classList.remove('is-open');
      if (miniMapInstance) { miniMapInstance.remove(); miniMapInstance = null; }
      openMiniMapIndex = null;
      button.textContent = '🗺️ Streckenverlauf anzeigen';
      return;
    }

    if (openMiniMapIndex !== null) {
      const prevMapEl = document.getElementById(`journey-mini-map-${openMiniMapIndex}`);
      if (prevMapEl) prevMapEl.classList.remove('is-open');
      if (miniMapInstance) { miniMapInstance.remove(); miniMapInstance = null; }
      const prevButton = document.querySelector(`.journey-map-toggle[data-journey-index="${openMiniMapIndex}"]`);
      if (prevButton) prevButton.textContent = '🗺️ Streckenverlauf anzeigen';
    }

    openMiniMapIndex = journeyIndex;
    mapEl.classList.add('is-open');
    button.textContent = '🗺️ Streckenverlauf ausblenden';

    let journeyWithPolylines = journeyFallback;
    if (lastJourneyParams) {
      try {
        const { journeys } = await API.getJourneys({
          ...lastJourneyParams,
          polylines: true,
          results: journeyIndex + 1,
        });
        if (journeys[journeys.length - 1]) journeyWithPolylines = journeys[journeys.length - 1];
      } catch (_) {
        // Fallback: ohne Polylines, zeigt dann nur die Marker-Punkte
      }
    }

    setTimeout(() => {
      miniMapInstance = LiveMap.createMiniMap(mapEl.id, journeyWithPolylines);
    }, 200);
  }

  function restoreLastStop() {
    try {
      const saved = JSON.parse(localStorage.getItem(LAST_STOP_KEY));
      if (saved && saved.id) selectStation(saved);
    } catch (_) {
      // kein gespeicherter Stop, ignorieren
    }
  }

  function init() {
    initSearch();
    initTabs();
    initJourneyPlanner();
    initNearby();
    renderFavoriteChips();
    renderRecentSearches();

    departuresModeFilter = ModeFilter.create(
      document.getElementById('departures-mode-filter'),
      'oepnv-navi:modes:departures',
      () => loadDepartures(),
    );
    journeyModeFilter = ModeFilter.create(
      document.getElementById('journey-mode-filter'),
      'oepnv-navi:modes:journey',
      () => {},
    );

    const mapModeFilter = ModeFilter.create(
      document.getElementById('map-mode-filter'),
      'oepnv-navi:modes:map',
      () => {},
    );
    LiveMap.setModeFilter(() => mapModeFilter.getModesParam());
    document.getElementById('map-locate').addEventListener('click', () => LiveMap.locateUser());
    document.getElementById('map-isolation-reset').addEventListener('click', () => LiveMap.clearIsolation());

    document.getElementById('clear-recent').addEventListener('click', () => { localStorage.removeItem(RECENT_SEARCHES_KEY); renderRecentSearches(); });
    document.querySelectorAll('[data-open-tab]').forEach((button) => button.addEventListener('click', () => activateTab(button.dataset.openTab)));

    document.getElementById('favorite-toggle').addEventListener('click', () => {
      if (currentStop) toggleFavorite(currentStop);
    });

    restoreLastStop();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);