const App = (() => {
  const FAVORITES_KEY = 'oepnv-navi:db-favorites';
  const LAST_STOP_KEY = 'oepnv-navi:db-last-stop';
  const RECENT_SEARCHES_KEY = 'oepnv-navi:db-recent-searches';
  const SEEN_DISRUPTIONS_KEY = 'oepnv-navi:db-seen-disruptions';
  const TRANSFER_SLACK_KEY = 'oepnv-navi:db-transfer-slack';
  const WHEELCHAIR_KEY = 'oepnv-navi:db-wheelchair';
  const FAVORITES_POLL_MS = 30000;

  let currentStop = null;
  let departuresPollHandle = null;
  let departuresModeFilter = null;
  let favoritesPollHandle = null;

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
    items.unshift({ id: station.id, name: station.name, source: station.source });
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(items.slice(0, 8)));
    renderRecentSearches();
  }

  function removeRecentSearch(id) {
    const items = loadRecentSearches().filter((item) => item.id !== id);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(items));
    renderRecentSearches();
  }

  function renderRecentSearches() {
    const container = document.getElementById('recent-searches');
    if (!container) return;
    const items = loadRecentSearches();
    container.innerHTML = '';
    if (!items.length) {
      container.innerHTML = `<div class="recent-empty">${escapeHtml(I18N.t('recent.empty'))}</div>`;
      return;
    }
    items.forEach((item) => {
      const wrap = document.createElement('div');
      wrap.className = 'recent-item';

      const select = document.createElement('button');
      select.type = 'button';
      select.className = 'recent-item__select';
      select.innerHTML = `<span>↺</span><strong>${escapeHtml(item.name)}</strong>`;
      select.addEventListener('click', () => selectStation(item));

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'recent-item__remove';
      remove.setAttribute('aria-label', I18N.t('recent.remove', { name: item.name }));
      remove.textContent = '×';
      remove.addEventListener('click', (e) => {
        e.stopPropagation();
        removeRecentSearch(item.id);
      });

      wrap.appendChild(select);
      wrap.appendChild(remove);
      container.appendChild(wrap);
    });
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
  }

  // VBB-Störungstexte (HAFAS-remarks) enthalten gelegentlich einen eingebetteten
  // "[MEHR/MORE]"-Link zur offiziellen Störungsmeldung, z.B.:
  //   Bauarbeiten ... <a href="https://www.bvg.de/...">[MEHR/MORE]</a>
  // escapeHtml() allein macht daraus nur sichtbaren Text statt eines klickbaren
  // Links. Diese Funktion erlaubt gezielt NUR <a href="http(s)://...">Label</a> -
  // alles andere (auch verschachtelte Tags im Label) wird escaped, damit aus den
  // Störungsmeldungen kein beliebiges HTML/Script eingeschleust werden kann.
  function linkifyRemarkText(raw) {
    if (!raw) return '';
    const anchorRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let result = '';
    let lastIndex = 0;
    let match;

    while ((match = anchorRegex.exec(raw)) !== null) {
      result += escapeHtml(raw.slice(lastIndex, match.index));
      const href = match[1];
      const label = match[2].replace(/<[^>]*>/g, '').trim();
      if (/^https?:\/\//i.test(href)) {
        result += `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label || href)}</a>`;
      } else {
        // Unbekanntes/unsicheres Ziel - lieber nur als Text zeigen als verlinken.
        result += escapeHtml(label);
      }
      lastIndex = anchorRegex.lastIndex;
    }
    result += escapeHtml(raw.slice(lastIndex));
    return result;
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
    const cardContainer = document.getElementById('favorite-cards');
    const favorites = loadFavorites();
    if (cardContainer) cardContainer.innerHTML = '';

    favorites.forEach((fav) => {
      if (cardContainer) {
        const card = document.createElement('button');
        card.className = 'favorite-card';
        card.dataset.favId = fav.id;
        card.innerHTML = `
          <span class="favorite-card__star">★</span>
          <span>
            <strong>${escapeHtml(fav.name)}</strong>
            <small class="favorite-card__next" data-next-departure>${escapeHtml(I18N.t('favorites.loadingNext'))}</small>
            <small class="favorite-card__disruption" data-disruption hidden></small>
          </span>
          <span class="favorite-card__arrow">→</span>
        `;
        card.addEventListener('click', () => selectStation(fav));
        cardContainer.appendChild(card);
      }
    });

    // Das Favoriten-Menü ist ein eigenes Tab-Panel (siehe activateTab) - hier
    // wird nur noch der Inhalt darin gesteuert: Hinweistext, wenn leer,
    // ansonsten die Karten.
    const empty = document.getElementById('favorites-empty-hint');
    if (empty) empty.hidden = favorites.length > 0;

    updateNotifyToggleVisibility(favorites.length > 0);

    if (favorites.length > 0) {
      loadFavoriteNextDepartures(favorites);
      startFavoritesPolling();
    } else {
      stopFavoritesPolling();
    }
  }

  // ---------- Störungs-Erkennung für Favoriten ("Störungs-Push") ----------
  //
  // Läuft im Hintergrund, solange Favoriten vorhanden sind (siehe
  // startFavoritesPolling). Vergleicht bei jedem Poll die von /summary/departures
  // gelieferten Störungen einer Haltestelle mit den zuletzt gesehenen (in
  // localStorage gemerkt) und meldet nur wirklich NEUE Störungen - sonst würde
  // bei jedem 30s-Poll erneut benachrichtigt werden, solange eine Störung andauert.

  function loadSeenDisruptions() {
    try { return JSON.parse(localStorage.getItem(SEEN_DISRUPTIONS_KEY)) || {}; }
    catch (_) { return {}; }
  }

  function saveSeenDisruptions(map) {
    localStorage.setItem(SEEN_DISRUPTIONS_KEY, JSON.stringify(map));
  }

  function disruptionKey(d) {
    return d.id || `${d.type || ''}-${d.text || d.summary || ''}`;
  }

  function notifyNewDisruption(favName, disruption) {
    const message = `${favName}: ${disruption.summary || 'Neue Störung'}`;
    showToast(message, 'warning');

    if (window.Notification && Notification.permission === 'granted') {
      try {
        new Notification('Störung bei ' + favName, {
          body: disruption.summary || disruption.text || 'Es liegt eine neue Störungsmeldung vor.',
          tag: `oepnv-navi-disruption-${favName}-${disruptionKey(disruption)}`,
        });
      } catch (err) {
        console.error('Notification-Fehler:', err.message);
      }
    }
  }

  function renderFavoriteDisruption(card, favName, disruptions, seenMap, favId) {
    const el = card.querySelector('[data-disruption]');
    if (!el) return;

    if (!disruptions || disruptions.length === 0) {
      el.hidden = true;
      el.textContent = '';
      card.classList.remove('favorite-card--disrupted');
      delete seenMap[favId];
      return;
    }

    card.classList.add('favorite-card--disrupted');
    el.hidden = false;
    el.textContent = `⚠ ${disruptions[0].summary || 'Störung'}${disruptions.length > 1 ? ` (+${disruptions.length - 1} weitere)` : ''}`;

    const previousKeys = new Set(seenMap[favId] || []);
    disruptions.forEach((d) => {
      const key = disruptionKey(d);
      if (!previousKeys.has(key)) {
        notifyNewDisruption(favName, d);
      }
    });
    seenMap[favId] = disruptions.map(disruptionKey);
  }

  async function loadFavoriteNextDepartures(favorites) {
    const stations = favorites.map((f) => ({ id: f.id, source: f.source || 'vbb', name: f.name }));
    const seenMap = loadSeenDisruptions();

    try {
      const { results } = await API.getSummaryDepartures(stations);
      results.forEach((r) => {
        const card = document.querySelector(`.favorite-card[data-fav-id="${CSS.escape(String(r.id))}"]`);
        if (!card) return;
        const el = card.querySelector('[data-next-departure]');

        if (el) {
          if (r.error || !r.nextDeparture) {
            el.textContent = I18N.t('favorites.noDeparture');
          } else {
            const dep = r.nextDeparture;
            const minutesUntil = dep.when ? Math.max(0, Math.round((new Date(dep.when) - new Date()) / 60000)) : null;
            if (dep.cancelled) {
              el.innerHTML = `<span class="favorite-card__cancelled">${escapeHtml(dep.line || '')} ${escapeHtml(I18N.t('favorites.cancelledShort'))}</span>`;
            } else {
              el.textContent = `${dep.line || '?'} → ${dep.direction || ''} · ${minutesUntil != null ? minutesUntil + ' ' + I18N.t('favorites.minutesShort') : ''}`;
            }
          }
        }

        renderFavoriteDisruption(card, r.name || '', r.disruptions, seenMap, r.id);
      });
      saveSeenDisruptions(seenMap);
    } catch (err) {
      // Stillschweigend ignorieren - die Karten zeigen dann weiterhin "Lade..."
      // bzw. der Nutzer bekommt die Abfahrten trotzdem beim Antippen der Karte.
      console.error('Sammel-Abfahrten-Fehler:', err.message);
    }
  }

  function startFavoritesPolling() {
    if (favoritesPollHandle) clearInterval(favoritesPollHandle);
    favoritesPollHandle = setInterval(() => {
      const favorites = loadFavorites();
      if (favorites.length > 0) loadFavoriteNextDepartures(favorites);
      else stopFavoritesPolling();
    }, FAVORITES_POLL_MS);
  }

  function stopFavoritesPolling() {
    if (favoritesPollHandle) {
      clearInterval(favoritesPollHandle);
      favoritesPollHandle = null;
    }
  }

  // ---------- Toast (kurze, unaufdringliche In-App-Meldung) ----------

  function showToast(message, variant = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast--${variant}`;
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('is-visible'));

    setTimeout(() => {
      toast.classList.remove('is-visible');
      setTimeout(() => toast.remove(), 300);
    }, 6000);
  }

  // ---------- Browser-Benachrichtigungen an/aus ----------

  function updateNotifyToggleVisibility(hasFavorites) {
    const btn = document.getElementById('notify-toggle');
    if (!btn) return;
    if (!hasFavorites || !window.Notification) {
      btn.hidden = true;
      return;
    }
    btn.hidden = false;
    if (Notification.permission === 'granted') {
      btn.textContent = `🔔 ${I18N.t('favorites.notifyActive')}`;
      btn.classList.add('is-active');
      btn.disabled = true;
    } else if (Notification.permission === 'denied') {
      btn.textContent = `🔕 ${I18N.t('favorites.notifyBlocked')}`;
      btn.classList.remove('is-active');
      btn.disabled = true;
    } else {
      btn.textContent = `🔔 ${I18N.t('favorites.enableNotify')}`;
      btn.classList.remove('is-active');
      btn.disabled = false;
    }
  }

  function initNotifications() {
    const btn = document.getElementById('notify-toggle');
    if (!btn || !window.Notification) return;
    btn.addEventListener('click', async () => {
      try {
        await Notification.requestPermission();
      } catch (err) {
        console.error('Notification-Permission-Fehler:', err.message);
      }
      updateNotifyToggleVisibility(loadFavorites().length > 0);
    });
    updateNotifyToggleVisibility(loadFavorites().length > 0);
  }

  function updateFavoriteButton() {
    const btn = document.getElementById('favorite-toggle');
    if (!currentStop) {
      btn.hidden = true;
      return;
    }
    btn.hidden = false;
    const active = isFavorite(currentStop.id);
    btn.textContent = `${active ? '★' : '☆'} ${I18N.t('favorites.favorite')}`;
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

    // Leeres Suchfeld antippen: zuletzt gesuchte Haltestellen als Vorschläge
    // zeigen, statt dass man erst tippen muss, um überhaupt etwas zu sehen.
    function showRecentSuggestions() {
      const recents = loadRecentSearches();
      if (!recents.length) {
        results.hidden = true;
        results.innerHTML = '';
        return;
      }
      results.innerHTML = `<li class="search-result-heading">${escapeHtml(I18N.t('search.recentSearches'))}</li>`;
      renderSearchResults(results, recents, (station) => {
        selectStation(station);
        input.value = '';
        results.hidden = true;
      }, { append: true });
    }

    input.addEventListener('focus', () => {
      if (input.value.trim().length < 2) showRecentSuggestions();
    });

    input.addEventListener('input', () => {
      const clear = document.getElementById('search-clear');
      if (clear) clear.hidden = input.value.length === 0;
      clearTimeout(searchDebounce);
      const query = input.value.trim();

      if (query.length < 2) {
        showRecentSuggestions();
        return;
      }

      searchDebounce = setTimeout(async () => {
        try {
          const stations = await API.searchAll(query);
          renderSearchResults(results, stations, (station) => {
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

  // Ein Symbol pro Ergebnis-Herkunft: VBB-Haltestelle (Nahverkehr), echter
  // DB-Bahnhof (bundesweit), oder Adresse/POI (nur im Routenplaner relevant).
  function resultIcon(loc) {
    if (loc.source === 'db') return '🚉';
    if (loc.kind === 'address') return '📍';
    if (loc.kind === 'poi') return '⭐';
    return '🚏'; // VBB-Haltestelle (U/S/Tram/Bus)
  }

  function renderSearchResults(container, locations, onSelect, { append = false } = {}) {
    if (!append) container.innerHTML = '';

    if (locations.length === 0) {
      container.innerHTML = `<li class="search-result search-result--empty">${escapeHtml(I18N.t('search.noResults'))}</li>`;
      container.hidden = false;
      return;
    }

    locations.forEach((loc) => {
      const li = document.createElement('li');
      li.className = 'search-result';
      const badge = loc.source === 'db' ? '<span class="search-result__badge">DB · bundesweit</span>' : '';
      li.innerHTML = `<span class="search-result__icon">${resultIcon(loc)}</span> ${loc.name}${badge}`;
      li.addEventListener('click', () => onSelect(loc));
      container.appendChild(li);
    });

    container.hidden = false;
  }

  function selectStation(station) {
    currentStop = station;
    localStorage.setItem(LAST_STOP_KEY, JSON.stringify({ id: station.id, name: station.name, source: station.source }));
    saveRecentSearch(station);
    activateTab('departures');
    document.getElementById('board-station-name').textContent = station.name;
    document.getElementById('board-empty-state').hidden = true;
    document.getElementById('welcome-panel').hidden = true;
    document.getElementById('departures-view').hidden = false;
    updateFavoriteButton();

    // Störungsanzeige der zuvor gewählten Haltestelle sofort verstecken,
    // damit nicht kurz die alten Störungen der letzten Station aufblitzen,
    // bevor die neuen Abfahrten geladen sind.
    const disruptionEl = document.getElementById('station-disruption');
    if (disruptionEl) { disruptionEl.hidden = true; disruptionEl.innerHTML = ''; }
    const elevatorEl = document.getElementById('elevator-status');
    if (elevatorEl) { elevatorEl.hidden = true; elevatorEl.innerHTML = ''; }

    // Der Modefilter (Verkehrsmittel S/U/Tram/Bus/...) gilt nur für VBB-
    // Haltestellen - die bundesweite DB-Anbindung unterstützt keine Filterung.
    const modeFilterEl = document.getElementById('departures-mode-filter');
    if (modeFilterEl) modeFilterEl.hidden = station.source === 'db';

    loadDepartures();
    restartDeparturesPolling();
  }

  async function loadDepartures() {
    if (!currentStop) return;
    const board = document.getElementById('departure-board');

    try {
      const data = currentStop.source === 'db'
        ? await API.getDbDepartures(currentStop.id)
        : await API.getDepartures(currentStop.id, {
            modes: departuresModeFilter ? departuresModeFilter.getModesParam() : null,
          });
      renderDepartureBoard(data.departures);
      renderStationDisruptions(data.disruptions);
    } catch (err) {
      board.innerHTML = `<div class="board-error">⚠ ${err.message}</div>`;
    }
  }

  // Zeigt echte Störungsmeldungen (Bauarbeiten, Ausfälle, Umleitungen) an, die
  // auf einer der aktuell angezeigten Abfahrten der gewählten Haltestelle
  // liegen - direkt unterhalb der Abfahrtstafel, damit man sie nicht übersieht.
  // Aufzugsmeldungen sind eine Untermenge der allgemeinen Störungen (HAFAS
  // liefert sie als ganz normale "warning"-Remarks) - werden aber separat und
  // ruhiger dargestellt, weil es sich um eine Zugänglichkeits-Info handelt und
  // nicht zwangsläufig um eine Störung der eigenen Fahrt.
  const ELEVATOR_PATTERN = /aufzug|fahrstuhl|aufzüge/i;

  function renderStationDisruptions(disruptions) {
    const disruptionEl = document.getElementById('station-disruption');
    const elevatorEl = document.getElementById('elevator-status');
    if (!disruptionEl && !elevatorEl) return;

    const all = disruptions || [];
    const elevatorItems = all.filter((d) => ELEVATOR_PATTERN.test(`${d.summary || ''} ${d.text || ''}`));
    const otherItems = all.filter((d) => !elevatorItems.includes(d));

    if (elevatorEl) {
      if (elevatorItems.length === 0) {
        elevatorEl.hidden = true;
        elevatorEl.innerHTML = '';
      } else {
        elevatorEl.hidden = false;
        elevatorEl.innerHTML = elevatorItems
          .map((d) => `<div class="elevator-status__item">♿ <strong>${escapeHtml(d.summary || 'Aufzugsstatus')}</strong>${d.text ? `<br>${linkifyRemarkText(d.text)}` : ''}</div>`)
          .join('');
      }
    }

    if (disruptionEl) {
      if (otherItems.length === 0) {
        disruptionEl.hidden = true;
        disruptionEl.innerHTML = '';
      } else {
        disruptionEl.hidden = false;
        disruptionEl.innerHTML = otherItems
          .map((d) => `<div class="station-disruption__item">⚠ <strong>${escapeHtml(d.summary || 'Störung')}</strong>${d.text ? `<br>${linkifyRemarkText(d.text)}` : ''}</div>`)
          .join('');
      }
    }
  }

  let lastRenderedSource = null;

  function renderDepartureBoard(departures) {
    const board = document.getElementById('departure-board');
    const source = currentStop ? currentStop.source : null;

    if (departures.length === 0) {
      board.innerHTML = `<div class="board-empty">${escapeHtml(I18N.t('departures.noResultsForModes'))}</div>`;
      lastRenderedSource = source;
      return;
    }

    const existingRows = board.querySelectorAll('.flap-row');
    // Board komplett neu aufbauen, wenn sich die Anzahl ändert ODER die
    // Quelle wechselt (VBB<->DB) - sonst blieben bei zufällig gleicher
    // Zeilenzahl alte Klick-Handler/Klassen vom vorherigen Backend hängen.
    if (existingRows.length !== departures.length || lastRenderedSource !== source) {
      board.innerHTML = '';
      departures.forEach((dep, i) => {
        board.appendChild(buildDepartureRow(dep, i));
      });
      lastRenderedSource = source;
    }

    departures.forEach((dep, i) => {
      updateDepartureRow(board.children[i], dep);
    });
  }

  function buildDepartureRow(dep, index) {
    const row = document.createElement('div');
    row.className = 'flap-row';
    row.style.setProperty('--row-index', index);
    row.innerHTML = `
      <div class="flap-field flap-field--line">
        <span class="flap-label">${escapeHtml(I18N.t('departures.line'))}</span>
        <span class="flap-cell flap-cell--line" data-field="line"></span>
      </div>
      <div class="flap-field flap-field--direction">
        <span class="flap-label">${escapeHtml(I18N.t('departures.direction'))}</span>
        <span class="flap-cell flap-cell--direction" data-field="direction"></span>
      </div>
      <div class="flap-field flap-field--platform">
        <span class="flap-label">${escapeHtml(I18N.t('departures.platform'))}</span>
        <span class="flap-cell flap-cell--platform" data-field="platform"></span>
      </div>
      <div class="flap-field flap-field--time">
        <span class="flap-label">${escapeHtml(I18N.t('departures.time'))}</span>
        <span class="flap-cell flap-cell--time" data-field="time"></span>
      </div>
    `;

    // Klick-für-Fahrt-Details gibt es aktuell nur für VBB-Haltestellen (kein
    // passender Backend-Endpunkt für DB-Streckenverlauf/Zwischenhalte).
    if (currentStop && currentStop.source !== 'db') {
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
      row.classList.add('flap-row--clickable');
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
    }

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

    // Gleiswechsel deutlich hervorheben, statt die neue Gleisnummer einfach
    // kommentarlos anzuzeigen - genau das übersieht man sonst leicht, wenn
    // man aus Gewohnheit zum gewohnten Gleis läuft.
    const platformCell = row.querySelector('[data-field="platform"]');
    const hasPlatformChange = !dep.cancelled && dep.plannedPlatform && dep.platform && dep.platform !== dep.plannedPlatform;

    if (hasPlatformChange) {
      const newPlatform = String(dep.platform).toUpperCase();
      const plannedPlatform = String(dep.plannedPlatform).toUpperCase();
      if (platformCell.dataset.changedTo !== newPlatform || platformCell.dataset.changedFrom !== plannedPlatform) {
        platformCell.dataset.changedTo = newPlatform;
        platformCell.dataset.changedFrom = plannedPlatform;
        platformCell.classList.add('flap-cell--platform-changed');
        platformCell.innerHTML = `
          <span class="platform-changed-flag">${escapeHtml(I18N.t('departures.platformChanged', { n: newPlatform }))}</span>
          <span class="platform-changed-original">${escapeHtml(I18N.t('departures.platformInstead', { n: plannedPlatform }))}</span>
        `;
      }
    } else {
      if (platformCell.classList.contains('flap-cell--platform-changed')) {
        delete platformCell.dataset.changedTo;
        delete platformCell.dataset.changedFrom;
        platformCell.classList.remove('flap-cell--platform-changed');
        platformCell.innerHTML = '';
      }
      SplitFlap.render(platformCell, (dep.platform || '-').toUpperCase());
    }

    const timeCell = row.querySelector('[data-field="time"]');
    if (dep.cancelled) {
      const plannedTime = dep.plannedWhen
        ? new Date(dep.plannedWhen).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
        : '';
      if (timeCell.dataset.cancelledPlanned !== plannedTime) {
        timeCell.dataset.cancelledPlanned = plannedTime;
        timeCell.classList.add('flap-cell--time-cancelled');
        timeCell.innerHTML = `
          <span class="cancelled-flag">${escapeHtml(I18N.t('departures.cancelled'))}</span>
          <span class="cancelled-original">${escapeHtml(I18N.t('departures.plannedShort'))} ${escapeHtml(plannedTime)}</span>
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

    if (tabName === 'fares' && !faresLoadedOnce) {
      loadFares();
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

  function initNearbyDisruptions() {
    const btn = document.getElementById('disruptions-locate');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const container = document.getElementById('nearby-disruptions-list');
      container.innerHTML = '<div class="board-empty">Standort wird ermittelt…</div>';
      try {
        const { lat, lon } = await getUserLocation();
        container.innerHTML = '<div class="board-empty">Suche Störungen in der Nähe…</div>';
        const { disruptions } = await API.getNearbyDisruptions({ lat, lon, distance: 1000, stops: 6 });
        renderNearbyDisruptions(disruptions, container);
      } catch (err) {
        container.innerHTML = `<div class="board-error">⚠ ${err.message}</div>`;
      }
    });
  }

  function renderNearbyDisruptions(disruptions, container) {
    container.innerHTML = '';
    if (disruptions.length === 0) {
      container.innerHTML = '<div class="board-empty">Aktuell keine Störungen in deiner Nähe bekannt.</div>';
      return;
    }
    disruptions.forEach((d) => {
      const card = document.createElement('div');
      card.className = 'remark-card';
      const lines = d.affectedLines.length ? `Linie${d.affectedLines.length > 1 ? 'n' : ''} ${d.affectedLines.join(', ')}` : '';
      const stops = d.affectedStops.length ? ` · nahe ${d.affectedStops.join(', ')}` : '';
      card.innerHTML = `
        <div class="remark-card__summary">⚠ ${escapeHtml(d.summary || 'Hinweis')}</div>
        <div class="remark-card__text">${linkifyRemarkText(d.text || '')}</div>
        <div class="remark-card__meta">${escapeHtml(lines)}${escapeHtml(stops)}</div>
      `;
      container.appendChild(card);
    });
  }

  let faresLoadedOnce = false;

  async function loadFares() {
    const content = document.getElementById('fares-content');
    const companies = document.getElementById('fares-companies');
    try {
      const fares = await API.getFares();
      faresLoadedOnce = true;
      document.getElementById('fares-stand').textContent = `Stand: ${new Date(fares.stand).toLocaleDateString('de-DE')}`;

      content.innerHTML = fares.gruppen.map((gruppe) => `
        <div class="fare-group">
          <h3>${escapeHtml(gruppe.titel)}</h3>
          <div class="fare-rows">
            ${gruppe.tickets.map((t) => `
              <div class="fare-row">
                <div><strong>${escapeHtml(t.name)}</strong><small>${escapeHtml(t.bereich)}${t.hinweis ? ' · ' + escapeHtml(t.hinweis) : ''}</small></div>
                <div class="fare-row__price">${t.preis.toFixed(2).replace('.', ',')} €</div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('');

      companies.innerHTML = fares.unternehmen.map((u) => `
        <a class="company-link" href="${u.url}" target="_blank" rel="noopener noreferrer">
          <span><strong>${escapeHtml(u.name)}</strong><small>${escapeHtml(u.beschreibung)}</small></span>
          <span class="company-link__arrow">↗</span>
        </a>
      `).join('');
    } catch (err) {
      content.innerHTML = `<div class="board-error">⚠ ${err.message}</div>`;
    }
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
        <div class="remark-card__summary">⚠ ${escapeHtml(r.summary || 'Hinweis')}</div>
        <div class="remark-card__text">${linkifyRemarkText(r.text || '')}</div>
        <div class="remark-card__meta">${escapeHtml(r.company || '')}</div>
      `;
      container.appendChild(card);
    });
  }

  function initJourneyPlanner() {
    setupJourneyInput('journey-from', (loc) => (journeyFrom = loc));
    setupJourneyInput('journey-to', (loc) => (journeyTo = loc));

    // Zuletzt gewählten Umstiegszeit-Puffer wiederherstellen, damit die
    // Einstellung nicht bei jedem Besuch neu gesetzt werden muss.
    const transferSlackSelect = document.getElementById('journey-transfer-slack');
    if (transferSlackSelect) {
      const saved = localStorage.getItem(TRANSFER_SLACK_KEY);
      if (saved !== null) transferSlackSelect.value = saved;
      transferSlackSelect.addEventListener('change', () => {
        localStorage.setItem(TRANSFER_SLACK_KEY, transferSlackSelect.value);
      });
    }

    // Ebenso für "nur rollstuhlgerechte Verbindungen".
    const wheelchairToggle = document.getElementById('journey-wheelchair');
    if (wheelchairToggle) {
      wheelchairToggle.checked = localStorage.getItem(WHEELCHAIR_KEY) === 'true';
      wheelchairToggle.addEventListener('change', () => {
        localStorage.setItem(WHEELCHAIR_KEY, wheelchairToggle.checked ? 'true' : 'false');
      });
    }

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
        setWhenChoice(button.dataset.when);
      });
    });

    document.getElementById('journey-submit').addEventListener('click', () => runJourneySearch());

    const shareBtn = document.getElementById('journey-share-btn');
    if (shareBtn) shareBtn.addEventListener('click', shareCurrentJourney);
  }

  // Setzt "Jetzt/Abfahrt um/Ankunft um" programmatisch (Klick-Handler UND
  // Wiederherstellung eines geteilten Links nutzen dieselbe Logik).
  function setWhenChoice(mode, whenValue) {
    document.querySelectorAll('.when-choice').forEach((item) => item.classList.toggle('is-active', item.dataset.when === mode));
    journeyArrivalMode = mode === 'arrival';
    const when = document.getElementById('journey-when');
    when.hidden = mode === 'now';
    if (mode !== 'now') {
      if (whenValue) {
        when.value = whenValue;
      } else if (!when.value) {
        const d = new Date(Date.now() + 10 * 60000);
        d.setSeconds(0, 0);
        when.value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      }
    }
  }

  async function runJourneySearch() {
    const resultsEl = document.getElementById('journey-results');
    const shareRow = document.getElementById('journey-share-row');

    if (!journeyFrom || !journeyTo) {
      resultsEl.innerHTML = `<div class="board-error">${escapeHtml(I18N.t('journey.selectFromResults'))}</div>`;
      return;
    }

    resultsEl.innerHTML = `<div class="board-empty">${escapeHtml(I18N.t('journey.searching'))}</div>`;
    if (shareRow) shareRow.hidden = true;

    const whenInput = document.getElementById('journey-when').value;
    const transferSlackSelect = document.getElementById('journey-transfer-slack');
    const wheelchairToggle = document.getElementById('journey-wheelchair');
    const params = {
      from: journeyFrom,
      to: journeyTo,
      when: whenInput || undefined,
      arrival: journeyArrivalMode,
      results: 5,
      transferSlack: transferSlackSelect && transferSlackSelect.value !== '' ? transferSlackSelect.value : undefined,
      wheelchair: wheelchairToggle ? wheelchairToggle.checked : false,
    };
    lastJourneyParams = params;

    try {
      const { journeys } = await API.getJourneys(params);
      renderJourneys(journeys, resultsEl);
      if (shareRow) shareRow.hidden = false;
    } catch (err) {
      resultsEl.innerHTML = `<div class="board-error">⚠ ${err.message}</div>`;
    }
  }

  // ---------- Route teilen ----------
  //
  // Teilt nicht eine einzelne, schnell veraltende Verbindung, sondern die
  // SUCHE selbst (Start, Ziel, Zeit, Optionen) - wer den Link öffnet, bekommt
  // dieselbe Suche mit aktuellen Echtzeitdaten statt einer eingefrorenen,
  // möglicherweise längst überholten Verbindung.
  function buildJourneyShareUrl() {
    if (!journeyFrom || !journeyTo) return null;

    // "Mein Standort" wäre für den Empfänger irreführend (es ist ein
    // eingefrorener Koordinatenpunkt, nicht dessen eigener Standort) - im
    // geteilten Link daher neutral benennen.
    const fromName = journeyFrom.name === 'Mein Standort' ? 'Startpunkt' : journeyFrom.name;
    const toName = journeyTo.name === 'Mein Standort' ? 'Startpunkt' : journeyTo.name;

    const whenInput = document.getElementById('journey-when').value;
    const transferSlackSelect = document.getElementById('journey-transfer-slack');
    const wheelchairToggle = document.getElementById('journey-wheelchair');

    const params = new URLSearchParams({
      route: '1',
      fromLat: journeyFrom.lat,
      fromLon: journeyFrom.lon,
      fromName: fromName || 'Start',
      toLat: journeyTo.lat,
      toLon: journeyTo.lon,
      toName: toName || 'Ziel',
      arrival: journeyArrivalMode ? '1' : '0',
    });
    if (whenInput) params.set('when', whenInput);
    if (transferSlackSelect && transferSlackSelect.value !== '') params.set('transferSlack', transferSlackSelect.value);
    if (wheelchairToggle && wheelchairToggle.checked) params.set('wheelchair', '1');

    return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  }

  async function shareCurrentJourney() {
    const url = buildJourneyShareUrl();
    if (!url) return;

    const shareData = {
      title: 'ÖPNV Navi - Verbindung',
      text: `${journeyFrom.name} → ${journeyTo.name}`,
      url,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        // Nutzer hat den Teilen-Dialog abgebrochen - kein Fehler, kein Toast.
        if (err.name !== 'AbortError') console.error('Teilen-Fehler:', err.message);
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      showToast('Link kopiert!', 'info');
    } catch (err) {
      console.error('Clipboard-Fehler:', err.message);
      window.prompt('Link kopieren:', url);
    }
  }

  // Öffnet beim Start automatisch einen geteilten Link (?route=1&...), falls
  // vorhanden - inklusive derselben Suche, die der Absender eingestellt hatte.
  function restoreJourneyFromShareLink() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('route') !== '1') return;

    const fromLat = parseFloat(params.get('fromLat'));
    const fromLon = parseFloat(params.get('fromLon'));
    const toLat = parseFloat(params.get('toLat'));
    const toLon = parseFloat(params.get('toLon'));
    if ([fromLat, fromLon, toLat, toLon].some((v) => Number.isNaN(v))) return;

    journeyFrom = { lat: fromLat, lon: fromLon, name: params.get('fromName') || 'Start' };
    journeyTo = { lat: toLat, lon: toLon, name: params.get('toName') || 'Ziel' };
    document.getElementById('journey-from').value = journeyFrom.name;
    document.getElementById('journey-to').value = journeyTo.name;

    const whenValue = params.get('when') || '';
    setWhenChoice(params.get('arrival') === '1' ? 'arrival' : (whenValue ? 'departure' : 'now'), whenValue);

    const transferSlackParam = params.get('transferSlack');
    const transferSlackSelect = document.getElementById('journey-transfer-slack');
    if (transferSlackSelect && transferSlackParam) transferSlackSelect.value = transferSlackParam;

    const wheelchairToggle = document.getElementById('journey-wheelchair');
    if (wheelchairToggle) wheelchairToggle.checked = params.get('wheelchair') === '1';

    activateTab('journey');
    runJourneySearch();
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
            onSelect({ id: loc.id || undefined, lat: loc.latitude, lon: loc.longitude, name: loc.name, kind: loc.kind });
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
      container.innerHTML = `<div class="board-empty">${escapeHtml(I18N.t('journey.noResults'))}</div>`;
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

      const fareHtml = journey.fareEstimate && journey.fareEstimate.price != null
        ? journey.fareEstimate.exact
          ? `<div class="journey-fare journey-fare--exact">💶 ${journey.fareEstimate.price.toFixed(2).replace('.', ',')} € <small>(Tarifbereich ${journey.fareEstimate.zone}, Einzelfahrschein, ohne Gewähr)</small></div>`
          : `<div class="journey-fare">💶 ca. ${journey.fareEstimate.price.toFixed(2).replace('.', ',')} € <small>(Tarifbereich ~${journey.fareEstimate.zone}, geschätzt, ohne Gewähr)</small></div>`
        : '';

      card.innerHTML = `
        ${legsHtml}
        ${fareHtml}
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
    }, 200); // Wartet auf CSS-Höhen-Transition, damit Leaflet die Größe korrekt berechnet
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
    I18N.init();
    I18N.setOnLangChange(() => {
      // [data-i18n]-Elemente übernimmt I18N.applyStaticTranslations() bereits
      // selbst - hier nur die dynamisch (per JS-Template) erzeugten Bereiche
      // neu aufbauen, die Sprachwechsel sonst nicht mitbekommen würden.
      lastRenderedSource = null;
      if (currentStop) loadDepartures();
      renderFavoriteChips();
    });
    document.querySelectorAll('.lang-switch__btn').forEach((btn) => {
      btn.addEventListener('click', () => I18N.setLang(btn.dataset.lang));
    });

    initSearch();
    initTabs();
    initJourneyPlanner();
    initNearby();
    initNearbyDisruptions();
    initNotifications();
    TripAlarm.load();
    renderFavoriteChips();
    renderRecentSearches();

    departuresModeFilter = ModeFilter.create(
      document.getElementById('departures-mode-filter'),
      'oepnv-navi:modes:departures',
      () => loadDepartures(),
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
    restoreJourneyFromShareLink();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);