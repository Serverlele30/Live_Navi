// Mehrsprachigkeit: einfaches, erweiterbares Key-Value-Wörterbuch statt einer
// externen i18n-Library (die App ist klein genug, dass sich das nicht lohnt).
// Deutsch ist immer die Fallback-Sprache, falls ein Key in einer anderen
// Sprache fehlt - so kann man neue Sprachen nach und nach vervollständigen,
// ohne dass währenddessen Keys komplett leer/undefined angezeigt werden.
//
// Deckt aktuell ab: die komplette statische Oberfläche (Navigation,
// Überschriften, Buttons, Platzhalter) sowie die am häufigsten sichtbaren
// dynamisch erzeugten Texte (Abfahrtstafel-Beschriftungen, Favoriten-Karten,
// Formular-Rückmeldungen). Tiefer verschachtelte Bereiche (Fahrt-Detail-Modal,
// Fahrtalarm-Overlay, Live-Karten-Popups) sowie Störungstexte direkt von VBB
// bleiben bewusst auf Deutsch, da VBB dafür keine englischen Texte liefert.

const I18N = (() => {
  const STORAGE_KEY = 'oepnv-navi:db-lang';

  const translations = {
    de: {
      'search.placeholder': 'Haltestelle, Ort oder Ziel suchen…',
      'search.clear': 'Suche leeren',
      'nav.favorites': 'Favoriten',
      'nav.departures': 'Abfahrten',
      'nav.route': 'Route',
      'nav.map': 'Karte',
      'nav.freifahren': 'FreiFahren',
      'freifahren.eyebrow': 'LIVE-MELDUNGEN',
      'freifahren.title': 'FreiFahren',
      'freifahren.text': 'Aktuelle Hinweise und eine stille Prüfung deiner live verfolgten Fahrt.',
      'freifahren.loading': 'Meldungen werden geladen…',
      'freifahren.refresh': 'Aktualisieren',
      'freifahren.count': '{count} Meldungen',
      'freifahren.updated': 'Stand {time}',
      'freifahren.emptyTitle': 'Keine aktuellen Meldungen',
      'freifahren.emptyText': 'Derzeit liegen keine gültigen FreiFahren-Hinweise vor.',
      'freifahren.error': 'Meldungen sind gerade nicht verfügbar.',
      'freifahren.unknownStation': 'Unbekannte Haltestelle',
      'freifahren.report': 'MELDUNG',
      'freifahren.direction': 'Richtung {direction}',
      'freifahren.predicted': 'Prognose',
      'freifahren.validUntil': 'Gültig bis {time}',
      'freifahren.disclaimer': 'Nur informativ. Keine akustischen, Push- oder Pop-up-Warnungen. Meldungen können unvollständig sein.',
      'freifahren.liveLabel': 'FREIFAHREN · DEINE FAHRT',
      'freifahren.liveWaiting': 'Wird während der Live-Verfolgung geprüft.',
      'freifahren.liveChecking': 'Meldungen werden im Hintergrund der Karte geprüft.',
      'freifahren.liveUnavailable': 'Aktuelle Meldungen gerade nicht abrufbar.',
      'freifahren.liveClear': 'Auf dem weiteren Streckenabschnitt wurde keine passende Meldung gefunden.',
      'freifahren.liveAhead': '{forecast}: {line} bei {station}, etwa {km} km voraus. {directionNote} {relative}',
      'freifahren.livePossible': 'Hinweis',
      'freifahren.liveForecast': 'Prognose',
      'freifahren.liveDirection': 'Meldungsrichtung: {direction}.',
      'freifahren.liveSameDirection': 'Die Richtungsangabe passt zur Fahrt.',
      'freifahren.liveOppositePossible': 'Andere Richtungsangabe als deine Fahrt – eine Begegnung ist möglich, aber nicht sicher vorhersagbar.',
      'freifahren.liveDirectionUnknown': 'Die Bewegungsrichtung lässt sich aus den Daten nicht sicher ableiten.',
      'freifahren.routeNoMatch': 'FreiFahren geprüft · Keine passende Meldung an den Umstiegspunkten oder Linien gefunden.',
      'freifahren.routeMatch': '{count} passende FreiFahren-Meldung(en): {details}',
    
      'nav.more': 'Mehr',
      'nav.settings': 'Einstellungen',
      'nav.notifications': 'Benachrichtigungen',
      'common.optional': 'OPTIONAL',
      'common.showAll': 'Alle anzeigen',
      'common.live': 'LIVE',
      'common.current': 'AKTUELL',
      'common.clear': 'Leeren',
      'common.retry': 'Erneut versuchen',
      'common.footer': 'Live-Daten von VBB · Angaben ohne Gewähr',
      'welcome.title': 'Was fährt jetzt?',
      'welcome.text': 'Suche eine Haltestelle oder nutze deinen Standort, um die nächsten Abfahrten zu sehen.',
      'welcome.nearbyTitle': 'In meiner Nähe',
      'welcome.nearbyText': 'Haltestellen im Umkreis finden',
      'welcome.routeTitle': 'Route planen',
      'welcome.routeText': 'Von A nach B mit Bus & Bahn',
      'nearby.homeTitle': 'Haltestellen in der Nähe',
      'nearby.eyebrow': 'STANDORT',
      'nearby.title': 'In der Nähe',
      'nearby.text': 'Finde Haltestellen rund um deinen aktuellen Standort.',
      'nearby.locate': 'Meinen Standort verwenden',
      'nearby.emptyState': 'Nutze deinen Standort, um Haltestellen in deiner Nähe zu finden.',
      'departures.eyebrow': 'LIVE-ABFAHRTEN',
      'departures.noStation': 'Keine Haltestelle ausgewählt',
      'departures.refreshInfo': 'Aktualisierung alle 30 Sekunden',
      'departures.emptyState': 'Suche oben eine Haltestelle, um Live-Abfahrten zu sehen.',
      'departures.loading': 'Lade Abfahrten…',
      'departures.line': 'Linie',
      'departures.direction': 'Ziel',
      'departures.platform': 'Gleis',
      'departures.time': 'Abfahrt',
      'departures.cancelled': 'FÄLLT AUS',
      'departures.plannedShort': 'urspr.',
      'departures.platformChanged': 'GLEIS {n}',
      'departures.platformInstead': 'statt {n}',
      'departures.noResultsForModes': 'Keine Abfahrten für die gewählten Verkehrsmittel in den nächsten 30 Minuten.',
      'favorites.favorite': 'Favorit',
      'favorites.eyebrow': 'SCHNELLZUGRIFF',
      'favorites.title': 'Meine Haltestellen',
      'favorites.text': 'Deine gespeicherten Haltestellen mit Live-Abfahrten und Störungshinweisen.',
      'favorites.enableNotify': 'Störungsbenachrichtigungen aktivieren',
      'favorites.enableNotifyTitle': 'Störungen sofort mitbekommen',
      'favorites.enableNotifyText': 'Auch wenn die App gerade nicht offen ist.',
      'favorites.enableNotifyShort': 'Aktivieren',
      'favorites.notifyActive': 'Benachrichtigungen aktiv',
      'favorites.notifyActiveShort': '✓ Aktiv',
      'favorites.notifyBlocked': 'Benachrichtigungen blockiert',
      'favorites.notifyBlockedShort': 'Blockiert',
      'favorites.emptyHint': 'Noch keine Favoriten - tippe bei einer Haltestelle auf ☆, um sie hier anzupinnen.',
      'favorites.loadingNext': 'Lade nächste Abfahrt…',
      'favorites.noDeparture': 'Keine Abfahrt gefunden',
      'favorites.cancelledShort': 'fällt aus',
      'favorites.minutesShort': 'min',
      'map.title': 'Karte',
      'map.text': 'Fahrzeuge, Routen und deine aktuelle Fahrt live verfolgen.',
      'map.locate': 'Mein Standort',
      'map.following': 'Verfolge Linie',
      'map.live': 'live',
      'map.showAllLines': 'Alle Linien anzeigen',
      'journey.eyebrow': 'VERBINDUNG SUCHEN',
      'journey.title': 'Wohin möchtest du?',
      'journey.text': 'Starte mit deinem Standort oder suche einen Ausgangspunkt.',
      'journey.fromPlaceholder': 'Mein Standort oder Start…',
      'journey.toPlaceholder': 'Wohin?',
      'journey.useLocation': 'Meinen Standort verwenden',
      'journey.now': 'Jetzt',
      'journey.departureAt': 'Abfahrt um',
      'journey.arrivalAt': 'Ankunft um',
      'journey.wheelchair': 'Nur rollstuhlgerechte Verbindungen',
      'journey.bike': 'Fahrrad mitnehmen',
      'journey.modes': 'Verkehrsmittel',
      'journey.addVia': 'Zwischenhalt hinzufügen',
      'journey.viaPlaceholder': 'Zwischenhalt {n}',
      'journey.removeVia': 'Zwischenhalt entfernen',
      'journey.viaWaitLabel': 'Aufenthalt dort',
      'journey.viaWaitDirect': 'Direkt weiter',
      'journey.earlier': 'Früher',
      'journey.later': 'Später',
      'journey.submit': 'Verbindungen suchen',
      'journey.sourceNote': '🛰 Routenplanung mit Echtzeitdaten von VBB & Deutscher Bahn',
      'journey.share': 'Route teilen',
      'journey.selectFromResults': 'Bitte Start und Ziel aus der Liste auswählen.',
      'journey.searching': 'Suche Verbindungen…',
      'journey.noResults': 'Keine Verbindungen gefunden.',
      'journey.maxViasReached': 'Maximal 3 Zwischenhalte möglich.',
      'disruptions.title': 'Störungen',
      'disruptions.text': 'Ortsbezogene und netzweite Hinweise.',
      'disruptions.nearbyTitle': 'In deiner Nähe',
      'disruptions.useLocation': 'Standort verwenden',
      'disruptions.nearbyEmpty': 'Nutze deinen Standort für ortsbezogene Störungen.',
      'disruptions.networkTitle': 'Netzweit',
      'disruptions.loading': 'Störungsmeldungen werden geladen…',
      'disruptions.freifahrenTitle': 'FreiFahren-Meldungen',
      'disruptions.freifahrenRefresh': '↻ Aktualisieren',
      'disruptions.freifahrenLoading': 'FreiFahren-Meldungen werden geladen…',
      'fares.eyebrow': 'PREISE',
      'fares.title': 'Tickets',
      'fares.text': 'Übliche VBB-Fahrpreise auf einen Blick.',
      'fares.disclaimer': 'Angaben ohne Gewähr – Preise können sich ändern.',
      'fares.loading': 'Lade Fahrpreise…',
      'fares.buyTitle': 'Tickets kaufen',
      'more.eyebrow': 'WEITERE FUNKTIONEN',
      'more.text': 'Alles, was nicht bei jeder Fahrt gebraucht wird.',
      'more.favoritesText': 'Deine gespeicherten Haltestellen',
      'more.nearbyText': 'Haltestellen in deiner Umgebung',
      'more.disruptionsText': 'Ortsbezogen & netzweit',
      'more.faresText': 'Preise & wo kaufen',
      'more.notificationsText': 'Verlauf & Push-Status',
      'more.settingsText': 'Sprache, Anzeige & mehr',
      'more.historyEyebrow': 'VERLAUF',
      'more.historyTitle': 'Zuletzt gesucht',
      'more.langEyebrow': 'SPRACHE / LANGUAGE',
      'more.langTitle': 'Sprache',
      'more.aboutEyebrow': 'ÜBER',
      'more.aboutTitle': 'App-Info',
      'more.backend': 'Backend',
      'more.testConnection': 'Verbindung testen',
      'more.connectionOk': 'Erreichbar',
      'more.connectionError': 'Nicht erreichbar',
      'notifications.eyebrow': 'VERLAUF',
      'notifications.title': 'Benachrichtigungen',
      'notifications.text': 'Alles, was zuletzt eine Push- oder In-App-Benachrichtigung ausgelöst hat.',
      'notifications.empty': 'Noch keine Benachrichtigungen.',
      'settings.eyebrow': 'EINSTELLUNGEN',
      'settings.text': 'Anzeige, Sprache und Benachrichtigungen anpassen.',
      'settings.displayTitle': 'Anzeige',
      'settings.simpleModeTitle': 'Einfacher Modus',
      'settings.simpleModeText': 'Größere Schrift, weniger Optionen auf einen Blick.',
      'search.noResults': 'Keine Treffer',
      'search.recentSearches': 'Zuletzt gesucht',
      'search.resultsLabel': 'Suchergebnisse',
      'recent.empty': 'Noch keine Suchen.',
      'recent.remove': '{name} aus Verlauf entfernen',
      'a11y.skipLink': 'Zum Inhalt springen',
      'map.a11yDescription': 'Live-Karte mit Fahrzeugpositionen. Für Screenreader-Nutzer eingeschränkt zugänglich - Details zu einzelnen Fahrten sind über die Abfahrtstafel und den Routenplaner verfügbar.',
    },
    en: {
      'search.placeholder': 'Search for a stop, place or destination…',
      'search.clear': 'Clear search',
      'nav.favorites': 'Favorites',
      'nav.departures': 'Departures',
      'nav.route': 'Route',
      'nav.map': 'Map',
      'nav.freifahren': 'FreiFahren',
      'freifahren.eyebrow': 'LIVE REPORTS',
      'freifahren.title': 'FreiFahren',
      'freifahren.text': 'Current reports and a quiet check of the trip you are tracking live.',
      'freifahren.loading': 'Loading reports…',
      'freifahren.refresh': 'Refresh',
      'freifahren.count': '{count} reports',
      'freifahren.updated': 'Updated {time}',
      'freifahren.emptyTitle': 'No current reports',
      'freifahren.emptyText': 'There are currently no valid FreiFahren reports.',
      'freifahren.error': 'Reports are temporarily unavailable.',
      'freifahren.unknownStation': 'Unknown stop',
      'freifahren.report': 'REPORT',
      'freifahren.direction': 'Towards {direction}',
      'freifahren.predicted': 'Forecast',
      'freifahren.validUntil': 'Valid until {time}',
      'freifahren.disclaimer': 'Informational only. No sound, push notifications or pop-up alerts. Reports may be incomplete.',
      'freifahren.liveLabel': 'FREIFAHREN · YOUR TRIP',
      'freifahren.liveWaiting': 'Checked while live tracking is active.',
      'freifahren.liveChecking': 'Checking reports quietly while the map is open.',
      'freifahren.liveUnavailable': 'Current reports are temporarily unavailable.',
      'freifahren.liveClear': 'No matching report found further along your route.',
      'freifahren.liveAhead': '{forecast}: {line} at {station}, about {km} km ahead. {directionNote} {relative}',
      'freifahren.livePossible': 'Report',
      'freifahren.liveForecast': 'Forecast',
      'freifahren.liveDirection': 'Reported direction: {direction}.',
      'freifahren.liveSameDirection': 'The reported direction matches your trip.',
      'freifahren.liveOppositePossible': 'The reported direction differs from your trip – an encounter is possible, but cannot be predicted with certainty.',
      'freifahren.liveDirectionUnknown': 'Movement direction cannot be determined reliably from the data.',
      'freifahren.routeNoMatch': 'FreiFahren checked · No matching report found at route stops or lines.',
      'freifahren.routeMatch': '{count} matching FreiFahren report(s): {details}',
    
      'nav.more': 'More',
      'nav.settings': 'Settings',
      'nav.notifications': 'Notifications',
      'common.optional': 'OPTIONAL',
      'common.showAll': 'Show all',
      'common.live': 'LIVE',
      'common.current': 'CURRENT',
      'common.clear': 'Clear',
      'common.retry': 'Try again',
      'common.footer': 'Live data from VBB · No guarantee of accuracy',
      'welcome.title': 'What\u2019s leaving now?',
      'welcome.text': 'Search for a stop or use your location to see the next departures.',
      'welcome.nearbyTitle': 'Nearby',
      'welcome.nearbyText': 'Find stops around you',
      'welcome.routeTitle': 'Plan a route',
      'welcome.routeText': 'From A to B by bus & train',
      'nearby.homeTitle': 'Stops nearby',
      'nearby.eyebrow': 'LOCATION',
      'nearby.title': 'Nearby',
      'nearby.text': 'Find stops around your current location.',
      'nearby.locate': 'Use my location',
      'nearby.emptyState': 'Use your location to find stops nearby.',
      'departures.eyebrow': 'LIVE DEPARTURES',
      'departures.noStation': 'No stop selected',
      'departures.refreshInfo': 'Updates every 30 seconds',
      'departures.emptyState': 'Search for a stop above to see live departures.',
      'departures.loading': 'Loading departures…',
      'departures.line': 'Line',
      'departures.direction': 'Towards',
      'departures.platform': 'Platform',
      'departures.time': 'Departure',
      'departures.cancelled': 'CANCELLED',
      'departures.plannedShort': 'orig.',
      'departures.platformChanged': 'PLATFORM {n}',
      'departures.platformInstead': 'instead of {n}',
      'departures.noResultsForModes': 'No departures for the selected transport modes in the next 30 minutes.',
      'favorites.favorite': 'Favorite',
      'favorites.eyebrow': 'QUICK ACCESS',
      'favorites.title': 'My Stops',
      'favorites.text': 'Your saved stops with live departures and disruption notices.',
      'favorites.enableNotify': 'Enable disruption notifications',
      'favorites.enableNotifyTitle': 'Hear about disruptions right away',
      'favorites.enableNotifyText': 'Even when the app isn\u2019t open.',
      'favorites.enableNotifyShort': 'Enable',
      'favorites.notifyActive': 'Notifications active',
      'favorites.notifyActiveShort': '✓ Active',
      'favorites.notifyBlocked': 'Notifications blocked',
      'favorites.notifyBlockedShort': 'Blocked',
      'favorites.emptyHint': 'No favorites yet - tap ☆ at a stop to pin it here.',
      'favorites.loadingNext': 'Loading next departure…',
      'favorites.noDeparture': 'No departure found',
      'favorites.cancelledShort': 'cancelled',
      'favorites.minutesShort': 'min',
      'map.title': 'Map',
      'map.text': 'Track vehicles, routes and your current trip live.',
      'map.locate': 'My location',
      'map.following': 'Tracking line',
      'map.live': 'live',
      'map.showAllLines': 'Show all lines',
      'journey.eyebrow': 'PLAN A JOURNEY',
      'journey.title': 'Where to?',
      'journey.text': 'Start with your location or search for a starting point.',
      'journey.fromPlaceholder': 'My location or start…',
      'journey.toPlaceholder': 'Where to?',
      'journey.useLocation': 'Use my location',
      'journey.now': 'Now',
      'journey.departureAt': 'Depart at',
      'journey.arrivalAt': 'Arrive by',
      'journey.wheelchair': 'Wheelchair-accessible connections only',
      'journey.bike': 'Take my bike along',
      'journey.modes': 'Transit modes',
      'journey.addVia': 'Add stopover',
      'journey.viaPlaceholder': 'Stopover {n}',
      'journey.removeVia': 'Remove stopover',
      'journey.viaWaitLabel': 'Wait time there',
      'journey.viaWaitDirect': 'Continue immediately',
      'journey.earlier': 'Earlier',
      'journey.later': 'Later',
      'journey.submit': 'Search connections',
      'journey.sourceNote': '🛰 Journey planning with real-time VBB & Deutsche Bahn data',
      'journey.share': 'Share route',
      'journey.selectFromResults': 'Please choose start and destination from the list.',
      'journey.searching': 'Searching for connections…',
      'journey.noResults': 'No connections found.',
      'journey.maxViasReached': 'Maximum of 3 stopovers.',
      'disruptions.title': 'Disruptions',
      'disruptions.text': 'Location-based and network-wide notices.',
      'disruptions.nearbyTitle': 'Near you',
      'disruptions.useLocation': 'Use location',
      'disruptions.nearbyEmpty': 'Use your location for nearby disruptions.',
      'disruptions.networkTitle': 'Network-wide',
      'disruptions.loading': 'Loading disruption notices…',
      'disruptions.freifahrenTitle': 'FreiFahren reports',
      'disruptions.freifahrenRefresh': '↻ Refresh',
      'disruptions.freifahrenLoading': 'Loading FreiFahren reports…',
      'fares.eyebrow': 'FARES',
      'fares.title': 'Tickets',
      'fares.text': 'Common VBB fares at a glance.',
      'fares.disclaimer': 'No guarantee of accuracy – prices may change.',
      'fares.loading': 'Loading fares…',
      'fares.buyTitle': 'Buy tickets',
      'more.eyebrow': 'MORE FEATURES',
      'more.text': 'Everything you don\u2019t need on every trip.',
      'more.favoritesText': 'Your saved stops',
      'more.nearbyText': 'Stops around you',
      'more.disruptionsText': 'Local & network-wide',
      'more.faresText': 'Prices & where to buy',
      'more.notificationsText': 'History & push status',
      'more.settingsText': 'Language, display & more',
      'more.historyEyebrow': 'HISTORY',
      'more.historyTitle': 'Recently searched',
      'more.langEyebrow': 'SPRACHE / LANGUAGE',
      'more.langTitle': 'Language',
      'more.aboutEyebrow': 'ABOUT',
      'more.aboutTitle': 'App info',
      'more.backend': 'Backend',
      'more.testConnection': 'Test connection',
      'more.connectionOk': 'Reachable',
      'more.connectionError': 'Unreachable',
      'notifications.eyebrow': 'HISTORY',
      'notifications.title': 'Notifications',
      'notifications.text': 'Everything that recently triggered a push or in-app notification.',
      'notifications.empty': 'No notifications yet.',
      'settings.eyebrow': 'SETTINGS',
      'settings.text': 'Adjust display, language and notifications.',
      'settings.displayTitle': 'Display',
      'settings.simpleModeTitle': 'Simple mode',
      'settings.simpleModeText': 'Larger text, fewer options at a glance.',
      'search.noResults': 'No results',
      'search.recentSearches': 'Recently searched',
      'search.resultsLabel': 'Search results',
      'recent.empty': 'No searches yet.',
      'recent.remove': 'Remove {name} from history',
      'a11y.skipLink': 'Skip to content',
      'map.a11yDescription': 'Live map with vehicle positions. Limited accessibility for screen reader users - trip details are available via the departure board and journey planner.',
    },
  };

  let lang = 'de';
  let onLangChange = null;

  function detectLang() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && translations[saved]) return saved;
    } catch (_) { /* localStorage evtl. nicht verfügbar */ }
    const browserLang = (navigator.language || 'de').slice(0, 2).toLowerCase();
    return translations[browserLang] ? browserLang : 'de';
  }

  function t(key, vars) {
    let str = (translations[lang] && translations[lang][key]) || translations.de[key] || key;
    if (vars) {
      Object.keys(vars).forEach((k) => {
        str = str.replace(`{${k}}`, vars[k]);
      });
    }
    return str;
  }

  function applyStaticTranslations() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    document.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
      el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.dataset.i18nTitle);
    });
    document.querySelectorAll('.lang-switch__btn').forEach((btn) => {
      const active = btn.dataset.lang === lang;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  function setLang(newLang) {
    if (!translations[newLang] || newLang === lang) return;
    lang = newLang;
    try { localStorage.setItem(STORAGE_KEY, newLang); } catch (_) { /* ignorieren */ }
    document.documentElement.lang = newLang;
    applyStaticTranslations();
    if (typeof onLangChange === 'function') onLangChange(newLang);
  }

  // Wird von app.js gesetzt, um nach einem Sprachwechsel auch dynamisch
  // erzeugte Inhalte (z.B. gerade sichtbare Abfahrtstafel) neu zu rendern -
  // applyStaticTranslations() allein erreicht nur [data-i18n]-Elemente im DOM.
  function setOnLangChange(fn) {
    onLangChange = fn;
  }

  function getLang() {
    return lang;
  }

  function init() {
    lang = detectLang();
    document.documentElement.lang = lang;
    applyStaticTranslations();
  }

  return { t, setLang, getLang, setOnLangChange, init };
})();
